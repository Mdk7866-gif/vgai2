# Deploy vgAI2 on your fresh EC2 instance

For your **Ubuntu t3.medium, 30 GiB gp3, Mumbai** instance. Run the commands below in your **EC2 Ubuntu terminal**, in order. Stop if a command fails.

This guide uses `compose.deploy.yaml` to pull `mdk7866/vgai2-backend:latest` and `mdk7866/vgai2-frontend:latest`. Nginx and Certbot run in Docker. You do not need server-side builds, host nginx/Certbot, Node.js, Python, or a database installation. The admin portal stays local. Keep `nginx/templates/default.conf.template`: Compose mounts this required file for HTTPS and frontend/backend routing.

## 1. AWS and Hostinger settings

Before running certificate commands:

- Associate an **Elastic IP** with your instance. Reconnect SSH using that IP if needed.
- Security group inbound: TCP **22 from your IP**, **80 and 443 from 0.0.0.0/0**. Keep outbound access enabled. Do not open 3000/8000.
- In Hostinger's **vgai2.com** DNS zone, point the **@ A record** to that Elastic IP. Remove conflicting apex A records and an apex AAAA record pointing elsewhere. Preserve email MX/TXT records.
- This setup serves **vgai2.com**, not www. Keep port 80 open for renewals.

## 2. Install Docker

Based on [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git nano dnsutils
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
uname -m
```

Architecture should be `x86_64`, matching the published linux/amd64 images. All Docker commands use sudo; no group change is required. If Ubuntu requests a reboot after upgrading, run `sudo reboot`, reconnect, then continue.

## 3. Download the configuration

```bash
sudo mkdir -p /opt/vgai
sudo chown "$(id -un):$(id -gn)" /opt/vgai
git clone https://github.com/Mdk7866-gif/vgai2.git /opt/vgai
cd /opt/vgai
ls compose.deploy.yaml .env.example nginx/templates/default.conf.template
```

If this private repository requests credentials, enter your GitHub username and a repository-read token as the password. Never put a token in the clone URL. The clone supplies configuration; EC2 does not build the application.

## 4. Fill your production environment variables

```bash
cd /opt/vgai
umask 077
cp .env.example .env
chmod 600 .env
nano .env
```

Copy the real values from your computer's `backend/.env` into these matching fields. The following is **file content for nano**, not terminal commands. Replace every COPY placeholder. Keep secrets single-quoted, particularly when containing dollar signs or #. Never run `source .env`, commit it, or share it.

```dotenv
DOMAIN=vgai2.com
PROJECT_NAME=vgAI2
ACME_EMAIL=hello@vgai2.com
IMAGE_TAG=latest
UVICORN_WORKERS=2

SUPABASE_URL='COPY_SUPABASE_URL'
SUPABASE_PUBLISHABLE_KEY='COPY_SUPABASE_PUBLISHABLE_KEY'
SUPABASE_SECRET_KEY='COPY_SUPABASE_SECRET_KEY'

NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME='COPY_CLOUDINARY_CLOUD_NAME'
CLOUDINARY_API_KEY='COPY_CLOUDINARY_API_KEY'
CLOUDINARY_API_SECRET='COPY_CLOUDINARY_API_SECRET'
CLOUDINARY_FOLDER_NAME='COPY_EXISTING_FOLDER_NAME'

CHATGPT_PAID_API_KEY='COPY_OPENAI_KEY'
OPENROUTER_PAID_API_KEY='COPY_OPENROUTER_KEY'
GEMINI_PAID_API_KEY=''

RAZORPAY_KEY_ID='COPY_LIVE_KEY_ID'
RAZORPAY_KEY_SECRET='COPY_LIVE_KEY_SECRET'
RAZORPAY_WEBHOOK_SECRET='COPY_NEW_PRIVATE_WEBHOOK_SECRET'
```

Save with **Ctrl+O**, **Enter**, **Ctrl+X**.

Checked against `backend/app/config.py`:

- Razorpay ID must start with `rzp_live_` and use its matching secret. Rotate the webhook secret exposed in your screenshot; use the new identical value in Razorpay and this file.
- Keep Cloudinary's existing folder value exactly. Gemini is reserved and can stay empty. ElevenLabs is not currently consumed.
- Compose supplies `ALLOWED_ORIGINS=https://vgai2.com` automatically.
- `DATABASE_NAME` is ignored; the Supabase URL selects the hosted project.
- The frontend image already contains the public Supabase URL/key from `frontendweb/.env.local` and `NEXT_PUBLIC_BACKEND_URL=/api`. Template fields `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are build inputs; they are not required for this prebuilt deployment. You can populate them with the same public values, but changing them on EC2 does not change the frontend image. Never place backend secrets in public fields.
- `ACME_EMAIL` records your contact; the commands below pass it explicitly.

## 5. Check DNS and download images

```bash
cd /opt/vgai
dig +short A vgai2.com @1.1.1.1
dig +short A vgai2.com @8.8.8.8
dig +short AAAA vgai2.com @1.1.1.1
sudo ss -ltnp '( sport = :80 or sport = :443 )'
sudo docker compose -f compose.deploy.yaml config --quiet
sudo docker compose -f compose.deploy.yaml pull
mkdir -p certbot/conf certbot/www
```

Both A lookups must return your Elastic IP. For IPv4-only deployment, AAAA should be empty. Wait for DNS propagation if needed. Ports 80/443 must be free for initial setup. Config validation succeeds silently without exposing secrets.

If Docker Hub returns access denied or a rate limit:

```bash
sudo docker login --username mdk7866
sudo docker compose -f compose.deploy.yaml pull
```

Enter a Docker Hub access token at the password prompt.

## 6. Issue HTTPS before starting nginx

Test issuance first:

```bash
sudo docker run --rm -p 80:80 \
  -v /opt/vgai/certbot/conf:/etc/letsencrypt \
  -v /opt/vgai/certbot/www:/var/www/certbot \
  certbot/certbot certonly --standalone --dry-run \
  -d vgai2.com --email hello@vgai2.com --agree-tos --non-interactive
```

Only after success, issue the real certificate:

```bash
sudo docker run --rm -p 80:80 \
  -v /opt/vgai/certbot/conf:/etc/letsencrypt \
  -v /opt/vgai/certbot/www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d vgai2.com --email hello@vgai2.com --agree-tos --non-interactive

sudo test -s /opt/vgai/certbot/conf/live/vgai2.com/fullchain.pem
sudo test -s /opt/vgai/certbot/conf/live/vgai2.com/privkey.pem
```

The two test commands succeed silently. No certificate deletion is needed after the dry run.

## 7. Start and verify the website

```bash
cd /opt/vgai
sudo docker compose -f compose.deploy.yaml up -d
sudo docker compose -f compose.deploy.yaml ps
sudo docker compose -f compose.deploy.yaml exec nginx nginx -t
curl --fail --retry 12 --retry-connrefused --retry-delay 5 https://vgai2.com/api/health
curl --fail -I https://vgai2.com
curl -I http://vgai2.com
```

All four services should run. Health should return successful JSON, HTTPS should return 200, and HTTP should redirect to HTTPS. Open **https://vgai2.com**.

Test renewal while nginx is running:

```bash
sudo docker compose -f compose.deploy.yaml run --rm --entrypoint certbot certbot renew --webroot -w /var/www/certbot --dry-run
```

Certbot checks renewal every 12 hours, and nginx reloads certificates every 6 hours. Docker starts on boot; containers restart unless explicitly stopped. No extra cron job is required. Preserve `/opt/vgai/certbot` and `.env` across updates.

## 8. Confirm login and payments

You reported the migration and Supabase Auth configuration completed. Confirm they belong to the same Supabase project used by the deployed keys:

- Site URL: `https://vgai2.com`; redirect allowlist: `https://vgai2.com/**`. Retain localhost entries for local development.
- Migration `004_atomic_razorpay_credit_settlement.sql` applied. Do not import the full database snapshot over your existing database.
- Razorpay Live: ensure vgai2.com website approval and enable webhook `https://vgai2.com/api/payments/webhook` for `payment.captured` and `payment.failed`, using the same new secret as production.
- Verify Google login, project creation, /pricing, /about, /terms-and-conditions, /cancellation-refund-policy, /privacy-policy and /contact.
- Make one intended small live purchase; confirm capture, successful webhook delivery, Payment History and credits added exactly once. This charges real money. A health check alone does not verify payments or AI provider access.
- If opening signup to everyone, check access mode in your local admin portal. `allowed_only` intentionally requires approval.

If startup fails, inspect the logs:

```bash
sudo docker compose -f compose.deploy.yaml logs --tail=100 backend frontend nginx certbot
```
