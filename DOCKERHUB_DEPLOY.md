# Deploy prebuilt vgAI2 images

`backend/Dockerfile`, `backend/.dockerignore`, `frontendweb/Dockerfile`, and
`frontendweb/.dockerignore` define the local builds. `compose.deploy.yaml` runs
`mdk7866/vgai2-backend` and `mdk7866/vgai2-frontend` without building on EC2.
Use Ubuntu x86_64 (for example t3.small); these images target linux/amd64.

## Files needed on EC2

Copy `compose.deploy.yaml`, `.env.example`, and the `nginx/templates/` directory
into `/opt/vgai`. Copy `.env.example` to `.env` and fill in backend credentials.
Set DOMAIN=vgai2.com. Keep Hostinger email MX/TXT records when pointing the
domain's @ A record to the instance's Elastic IP. Allow 80/443 publicly and
22 only from your IP. Install Docker Engine and Compose using awsdeployment.md.

The frontend's public Supabase settings are compiled into its image. Changing
them on EC2 does not change the image; rebuild locally. Never put backend keys
in frontend build arguments. No host nginx or host Certbot is needed.

## Initial certificate and startup

Environment checklist (matched against backend/app/config.py):

- Copy SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.
- Copy NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER_NAME exactly, preserving existing media paths.
- Copy CHATGPT_PAID_API_KEY, OPENROUTER_PAID_API_KEY, GEMINI_PAID_API_KEY
  (Gemini is currently reserved).
- Copy RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and the rotated RAZORPAY_WEBHOOK_SECRET.
- Set DOMAIN=vgai2.com, ACME_EMAIL=hello@vgai2.com, PROJECT_NAME=vgAI2,
  UVICORN_WORKERS=2, IMAGE_TAG=latest.
- ALLOWED_ORIGINS is automatically overridden by Compose to https://vgai2.com.
- DATABASE_NAME exists in the local file but is not a Settings field; the
  Supabase project URL selects the database. It can be retained but is ignored.
- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY were taken from
  frontendweb/.env.local at image build time; NEXT_PUBLIC_BACKEND_URL is /api.

Quote secret values with single quotes in Compose .env files when they contain
literal dollar signs or other special characters, to prevent interpolation.
Never run `source .env`. Keep the file private and outside version control.

Run from `/opt/vgai` after DNS points to EC2. Port 80 must be free.
Do not source the credentials file as a shell script.

```bash
chmod 600 .env
mkdir -p certbot/conf certbot/www
docker compose -f compose.deploy.yaml config --quiet
docker compose -f compose.deploy.yaml pull
docker run --rm -p 80:80 \
  -v /opt/vgai/certbot/conf:/etc/letsencrypt \
  -v /opt/vgai/certbot/www:/var/www/certbot \
  certbot/certbot certonly --standalone --dry-run \
  -d vgai2.com --email hello@vgai2.com --agree-tos --non-interactive
```

After the dry run succeeds, issue the real certificate:

```bash
docker run --rm -p 80:80 \
  -v /opt/vgai/certbot/conf:/etc/letsencrypt \
  -v /opt/vgai/certbot/www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d vgai2.com --email hello@vgai2.com --agree-tos --non-interactive
docker compose -f compose.deploy.yaml up -d
curl --fail https://vgai2.com/api/health
docker compose -f compose.deploy.yaml ps
docker compose -f compose.deploy.yaml run --rm --entrypoint certbot certbot renew --webroot -w /var/www/certbot --dry-run
```

Certbot renews through the shared webroot and nginx periodically reloads the
certificate. Configure the Razorpay webhook after HTTPS works. Test login,
policy pages and payment reconciliation before opening paid access.

## Updates

After new images have been built and pushed locally:

```bash
cd /opt/vgai
docker compose -f compose.deploy.yaml pull
docker compose -f compose.deploy.yaml up -d
docker compose -f compose.deploy.yaml logs --tail=100
```

For private Docker Hub repositories run `docker login --username mdk7866` on
EC2 first. IMAGE_TAG in `.env` defaults to latest and can select a published
release tag for both application images.
