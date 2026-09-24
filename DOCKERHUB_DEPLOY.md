# Deploy or move vgAI2 to an EC2 instance

For your **Ubuntu t3.medium, 30 GiB gp3, Mumbai** instance. Run the commands below in your **EC2 Ubuntu terminal**, in order. Stop if a command fails.

This guide uses `compose.deploy.yaml` to pull `mdk7866/vgai2-backend:latest` and `mdk7866/vgai2-frontend:latest`. Nginx and Certbot run in Docker. You do not need server-side builds, host nginx/Certbot, Node.js, Python, or a database installation. The admin portal stays local. Keep `nginx/templates/default.conf.template`: Compose mounts this required file for HTTPS and frontend/backend routing.

Use this guide for a first deployment or to move the existing website to an EC2 instance in a different AWS account. An AWS account switch requires a new instance, security group, SSH key, Elastic IP, and HTTPS certificate; those resources do not move between accounts. Supabase and Cloudinary are hosted separately, so keep using the existing projects and credentials. Do not run a database import or create new Supabase/Cloudinary projects for this move.

## Moving from an existing AWS account

Plan a short maintenance window. The new server can be prepared before the domain cutover, but this guide's HTTP-01 certificate command only succeeds after `vgai2.com` points to the new server. During DNS propagation, some visitors may still reach the old server. Keep the old server intact until the new server is verified.

1. A few hours before the move, lower the Hostinger apex `@` A-record TTL for `vgai2.com` to 300 seconds if the DNS panel allows it. Record the current value so you can restore it later.
2. In the new AWS account, create a fresh Ubuntu EC2 instance, SSH key pair, security group, and Elastic IP. Use an `x86_64` instance type supported by your budget; the published images are `linux/amd64`. Apply the inbound rules in section 1. The old account's key pair, security group, and Elastic IP cannot be reused directly.
3. Follow sections 2–4 on the new instance. In `.env`, use the same production Supabase, Cloudinary, OpenAI, OpenRouter, and Razorpay values as the current deployment. Copy secrets securely from your own machine; do not put them in Git, chat, or a public document. Preserve `CLOUDINARY_FOLDER_NAME` exactly. If rotating the Razorpay webhook secret, change it both in the new `.env` and in the Razorpay webhook configuration.
4. Complete the pre-cutover checks in section 5 to confirm the new server can pull both Docker images and `docker compose ... config --quiet` succeeds. Keep the old website running. Do not run the certificate command in section 6 yet.
5. At cutover, change the Hostinger `@` A record to the new Elastic IP and remove any conflicting apex AAAA record that points to another server. Keep MX/TXT email records. Query public DNS until both A lookups in section 5 return the new IP and AAAA is empty (for this IPv4-only setup).
6. Once DNS points to the new instance, continue with sections 6–8 to issue its certificate, start the containers, and verify the site. The new account has no copy of the old account's certificate files, so issue a certificate for the same domain on the new server. Leave the old instance and its files untouched while you verify login, project access, media generation, and payment/webhook behavior.
7. After DNS has settled and the new site is confirmed, stop the old instance. Keep a backup of its deployment `.env` and certificate data in a secure location until the new deployment has been stable. Then remove old-account resources you no longer need and restore the DNS TTL.

If you are only pausing the current server between occasional friend testing sessions, do not repeat this account-migration process. Stop and start that same EC2 instance instead. It retains the EBS disk and Elastic IP; compute billing pauses while stopped, but disk and public IPv4 charges can continue. The website is unavailable while stopped.

Use an AWS account whose owner has explicitly agreed to host the production service and is prepared to control its billing and access. AWS promotional credits and eligibility are account-specific; do not assume that opening another account or using another person's account automatically qualifies for additional credits.

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
RAZORPAY_WEBHOOK_SECRET='COPY_WEBHOOK_SECRET'
```

Save with **Ctrl+O**, **Enter**, **Ctrl+X**.

Checked against `backend/app/config.py`:

- Razorpay ID must start with `rzp_live_` and use its matching secret. Use the same webhook secret configured for the Razorpay webhook. When migrating, you can reuse the existing secret; rotate it only if it was exposed, and then update Razorpay and this file to the same new value.
- Keep Cloudinary's existing folder value exactly. Gemini is reserved and can stay empty. ElevenLabs is not currently consumed.
- Compose supplies `ALLOWED_ORIGINS=https://vgai2.com` automatically.
- `DATABASE_NAME` is ignored; the Supabase URL selects the hosted project.
- The frontend image already contains the public Supabase URL/key from `frontendweb/.env.local` and `NEXT_PUBLIC_BACKEND_URL=/api`. Template fields `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are build inputs; they are not required for this prebuilt deployment. You can populate them with the same public values, but changing them on EC2 does not change the frontend image. Never place backend secrets in public fields.
- `ACME_EMAIL` records your contact; the commands below pass it explicitly.

## 5. Prepare the deployment and check DNS

Before the DNS cutover, run the configuration and image checks:

```bash
cd /opt/vgai
sudo ss -ltnp '( sport = :80 or sport = :443 )'
sudo docker compose -f compose.deploy.yaml config --quiet
sudo docker compose -f compose.deploy.yaml pull
mkdir -p certbot/conf certbot/www
chmod 755 certbot certbot/conf certbot/www
```

Ports 80/443 must be free on the new server. Config validation succeeds silently without exposing secrets.

If Docker Hub returns access denied or a rate limit:

```bash
sudo docker login --username mdk7866
sudo docker compose -f compose.deploy.yaml pull
```

Enter a Docker Hub access token at the password prompt.

At cutover, update Hostinger's `@` A record to the new Elastic IP. Then check public DNS:

```bash
dig +short A vgai2.com @1.1.1.1
dig +short A vgai2.com @8.8.8.8
dig +short AAAA vgai2.com @1.1.1.1
```

Both A lookups should return the new Elastic IP. For this IPv4-only setup, AAAA should be empty. Wait for propagation before requesting the certificate in section 6.

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
