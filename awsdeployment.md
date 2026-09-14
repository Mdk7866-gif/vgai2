# Deploying vgAI2 to AWS EC2

End-to-end instructions for running the vgAI product (this repo — **not** the
separate `vgai2admin` portal, which stays local-only) on a single EC2 instance
with Docker, behind nginx, with a free Let's Encrypt TLS certificate.

Written for a first deployment. Follow the sections in order; §1–§9 are the
initial setup, §10 onward is everything after that.

---

## 1. What actually gets deployed

Four containers, defined in [`docker-compose.yml`](./docker-compose.yml):

```
                    Internet
                       │
                  :80  │  :443          ← the only ports open on the instance
                       ▼
              ┌──────────────────┐
              │      nginx       │   TLS termination + reverse proxy
              └───┬──────────┬───┘
       /api/*     │          │     everything else
                  ▼          ▼
          ┌────────────┐  ┌────────────┐
          │  backend   │  │  frontend  │
          │  FastAPI   │  │  Next.js   │
          │   :8000    │  │   :3000    │
          └────────────┘  └────────────┘

          ┌────────────┐
          │  certbot   │   renews the certificate every 12h, silently
          └────────────┘
```

Two things to understand up front, because everything else follows from them:

**Everything is served from one origin.** `https://vgai2.com/` is the
frontend and `https://vgai2.com/api/...` is the backend. nginx strips the
`/api` prefix before forwarding, so FastAPI still sees `/users/me`, `/payments/...`
exactly as it does locally. Because the two halves share an origin, the frontend
calls the backend at the **relative** path `/api` — the domain name is never
compiled into the JavaScript bundle.

**The domain is written in exactly one place**: `DOMAIN` in the root `.env`.
nginx renders it into its `server_name` and certificate paths, and the backend
derives `ALLOWED_ORIGINS` from it. Changing the domain later is §11 and does not
require rebuilding the frontend.

There is no database or file storage to provision — Supabase and Cloudinary are
already hosted, and the same shared project is used, so the schema and all
existing media are live the moment the containers start.

---

## 2. One-time prep in this repo (do this on Windows, before touching AWS)

**Commit the backend lockfile.** `backend/uv.lock` was previously gitignored, so
a fresh clone on the server wouldn't have it and the image would resolve its own
dependency versions instead of yours. `backend/.gitignore` no longer excludes
it — commit the file:

```powershell
git add backend/uv.lock
git status                      # confirm no .env file is staged
git commit -m "Track backend uv.lock for reproducible Docker builds"
```

**Commit the regenerated frontend lockfile.** `frontendweb/package-lock.json` was
missing two Linux-only optional packages (`@emnapi/runtime`, `@emnapi/core`,
pulled in by Tailwind's `oxide-wasm32-wasi` engine), because npm on Windows never
records them. Local development never noticed — `npm install` is lenient — but
the image build uses `npm ci`, which refuses outright on a lockfile that doesn't
match `package.json`. It has been regenerated inside a Linux container, so it now
resolves on both platforms; the change is purely additive (no version moved).
Commit it along with everything else.

> If a future `npm install` on Windows ever strips those entries again, the
> symptom is `npm ci ... Missing: @emnapi/runtime from lock file` during
> `docker compose build frontend`. Regenerate the same way — in a throwaway
> directory so your Windows `node_modules` is left alone:
>
> ```powershell
> mkdir $env:TEMP\lockgen; cd C:\Users\ASUS\OneDrive\Desktop\vgai2\frontendweb
> cp package.json,package-lock.json $env:TEMP\lockgen
> docker run --rm -v "$env:TEMP\lockgen:/app" -w /app node:22-alpine npm install
> cp $env:TEMP\lockgen\package-lock.json .
> ```

**Confirm the images build at all** before spending time on a server. This needs
Docker Desktop running, and a `.env` with at least a *well-formed*
`NEXT_PUBLIC_SUPABASE_URL` and a non-empty anon key — the frontend build
prerenders pages that construct the Supabase client, so a placeholder like
`https://<your-project-ref>.supabase.co` fails with
`Invalid supabaseUrl: Provided URL is malformed`:

```powershell
cp .env.example .env      # then fill in the real values before building
docker compose build
```

Both images have been verified to build and run this way, with nginx routing
`/` to the frontend and `/api/*` to the backend over TLS.

**Push the repo** to GitHub (or wherever you clone from on EC2). Double-check
that no `.env` file went with it — the root `.gitignore` now blocks `.env` and
`certbot/`, but verify once with `git ls-files | grep -i env`. The only match
should be `.env.example` and `backend/env.example`.

---

## 3. Launch the EC2 instance

In the AWS Console → EC2 → **Launch instance**:

| Setting | Value | Why |
|---|---|---|
| AMI | **Ubuntu Server 24.04 LTS (x86_64)** | Everything below assumes apt + Ubuntu paths |
| Instance type | **t3.small** minimum, **t3.medium** recommended | See the memory note below |
| Key pair | Create one, download the `.pem` | Your only way in over SSH |
| Storage | **30 GiB gp3** | Docker images + build cache eat the 8 GiB default |
| Network | Default VPC, **auto-assign public IP: Enable** | |

**On instance size:** `next build` is the memory-hungry step. On a 1 GiB
`t2.micro` it will be killed by the OOM reaper partway through, usually with a
confusing "signal 9" error. `t3.small` (2 GiB) works with the swap file added in
§4. `t3.medium` (4 GiB) builds comfortably and leaves headroom for two uvicorn
workers plus the Node server under real traffic. If you want to stay on a tiny
instance, use the build-elsewhere path in §13 instead.

### Security group — which ports to open

Create a new security group with **exactly these three inbound rules**:

| Type | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| SSH | TCP | **22** | **My IP** | Your admin access only |
| HTTP | TCP | **80** | `0.0.0.0/0`, `::/0` | Let's Encrypt challenges + the redirect to HTTPS |
| HTTPS | TCP | **443** | `0.0.0.0/0`, `::/0` | The site itself |

**Do not open 3000 or 8000.** The frontend and backend containers use `expose`,
not `ports`, in `docker-compose.yml` — they are reachable only on the internal
Docker network, and nginx is the single way in. Opening those ports would expose
the backend without TLS and bypass the proxy entirely.

Port 80 has to stay open permanently even though the site is HTTPS-only:
certbot's renewal check every 90 days is served over plain HTTP at
`/.well-known/acme-challenge/`. Closing it breaks renewal silently, and you find
out when the certificate expires.

Outbound: leave the default "all traffic allowed". The backend calls OpenAI,
OpenRouter, Gemini, Supabase, Cloudinary and Razorpay, all outbound over 443.

### Allocate an Elastic IP — do not skip this

A default public IP **changes every time the instance is stopped and started**,
which would silently break your DNS record and the TLS certificate along with it.

EC2 → **Elastic IPs** → Allocate Elastic IP address → then **Actions → Associate**
it with your instance. Use that IP everywhere below.

---

## 4. First-boot setup on the instance

SSH in (from PowerShell; `chmod`-style permission errors don't apply on Windows):

```powershell
ssh -i C:\path\to\your-key.pem ubuntu@<ELASTIC_IP>
```

Everything from here runs on the server.

```bash
# --- System updates -------------------------------------------------------
sudo apt-get update && sudo apt-get upgrade -y

# --- Swap: insurance against the OOM killer during `next build` -----------
# 4 GiB, persisted across reboots. Cheap, and the difference between a build
# that finishes and one that dies at 80%.
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                                  # confirm the swap line is non-zero

# --- Docker Engine + Compose plugin, from Docker's own apt repo -----------
# (Ubuntu's packaged docker.io is older and ships no `docker compose`.)
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
                        docker-buildx-plugin docker-compose-plugin

# --- Run docker without sudo ---------------------------------------------
sudo usermod -aG docker $USER
```

Log out and back in for the group change to apply, then verify:

```bash
exit
```
```powershell
ssh -i C:\path\to\your-key.pem ubuntu@<ELASTIC_IP>
```
```bash
docker run --rm hello-world      # should print "Hello from Docker!"
docker compose version           # should print v2.x
```

Docker's own service is enabled on boot by default, so the stack comes back
after a reboot on its own (`restart: unless-stopped` on every service).

---

## 5. Get the code onto the instance

```bash
sudo mkdir -p /opt/vgai
sudo chown $USER:$USER /opt/vgai
git clone <your-repo-url> /opt/vgai
cd /opt/vgai
```

A private repo needs credentials. The least painful option is a GitHub
[fine-grained personal access token](https://github.com/settings/tokens) with
read-only access to this one repo, used in place of a password when git prompts.
An SSH deploy key works too if you prefer.

Everything from here assumes you are in `/opt/vgai`.

---

## 6. Configure the environment

```bash
cp .env.example .env
nano .env
```

Fill in every blank. The values are the same ones already in your local
`backend/.env` and `frontendweb/.env.local` — copy them across rather than
regenerating keys. Read [`.env.example`](./.env.example) itself for what each
one is; the ones that matter most for this step:

```bash
DOMAIN=vgai2.com              # no https://, no trailing slash, no www
ACME_EMAIL=you@example.com    # gets the certificate-expiry warnings
```

Then lock the file down — it holds your Supabase service-role key, which
bypasses Row Level Security entirely:

```bash
chmod 600 .env
```

**Sanity check the substitution** before starting anything. This renders the
compose file with your values and prints the result:

```bash
docker compose config | grep -E "ALLOWED_ORIGINS|DOMAIN|NEXT_PUBLIC_BACKEND_URL"
```

You should see `https://vgai2.com` and `/api`. If `DOMAIN` shows up empty,
the `.env` file isn't where compose expects it (it must be `/opt/vgai/.env`).

---

## 7. Point the domain at the instance

High level, since you know Hostinger's panel: in the DNS zone for `syp3.com`,
add an **A record** with host `vgai` pointing at your **Elastic IP**, TTL as low
as the panel allows (300s) so mistakes are cheap to fix. Remove any conflicting
existing `vgai` A/CNAME record — two records for the same host is the usual
reason a certificate request fails on a domain that "looks fine" in a browser.

You do **not** need a `www.vgai` record; the nginx config and the certificate
request below both cover the bare hostname only.

Wait for it to propagate, then confirm **from the instance** that the name
resolves to the right address:

```bash
dig +short vgai2.com
```

This must print your Elastic IP and nothing else. Do not continue until it does
— Let's Encrypt resolves the name itself, and a request against a
not-yet-propagated record counts toward a weekly rate limit (5 failures per
hostname per hour, 5 duplicate certificates per week).

---

## 8. Issue the TLS certificate

Chicken-and-egg problem: nginx won't start because its config points at a
certificate that doesn't exist yet, and the usual way to get a certificate is
through nginx. Break it by running certbot once in **standalone** mode — it
binds port 80 itself, which is free because nginx isn't running yet.

```bash
cd /opt/vgai
set -a; source .env; set +a       # makes $DOMAIN and $ACME_EMAIL available
mkdir -p certbot/conf certbot/www
```

**Do a staging run first.** Let's Encrypt's production rate limits are strict
and a typo in the domain burns one of five weekly attempts; the staging server
has no meaningful limit and exercises the identical code path:

```bash
sudo docker run --rm -p 80:80 \
  -v "/opt/vgai/certbot/conf:/etc/letsencrypt" \
  -v "/opt/vgai/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
    --staging \
    -d "$DOMAIN" \
    --email "$ACME_EMAIL" \
    --agree-tos --no-eff-email --non-interactive
```

If that reports success, throw the staging certificate away and request the real
one (the browser rejects staging certificates, so you cannot keep it):

```bash
sudo rm -rf /opt/vgai/certbot/conf/*

sudo docker run --rm -p 80:80 \
  -v "/opt/vgai/certbot/conf:/etc/letsencrypt" \
  -v "/opt/vgai/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
    -d "$DOMAIN" \
    --email "$ACME_EMAIL" \
    --agree-tos --no-eff-email --non-interactive
```

Confirm the files landed where nginx expects them:

```bash
sudo ls -l /opt/vgai/certbot/conf/live/$DOMAIN/
# fullchain.pem and privkey.pem must both be here
```

From now on renewals are automatic: the `certbot` container in the stack checks
twice a day and renews over the **webroot** method (writing into
`certbot/www`, which nginx serves at `/.well-known/acme-challenge/`) — no
downtime, no port juggling. nginx reloads itself every 6 hours to pick up a
renewed certificate.

---

## 9. Build and start

```bash
cd /opt/vgai
docker compose build            # 5-15 min on first run; the frontend is the slow half
docker compose up -d
docker compose ps               # all four services should read "running"
```

Verify, in this order:

```bash
# 1. Backend health, from inside the network
docker compose exec backend python -c \
  "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read())"

# 2. Through the proxy, over TLS
curl -I https://vgai2.com
curl    https://vgai2.com/api/health      # -> {"success":true,"status":"ok"}

# 3. The HTTP -> HTTPS redirect
curl -I http://vgai2.com                  # -> 301, Location: https://...
```

Then open `https://vgai2.com` in a browser and check the padlock. Sign-in
will still fail at this point — that's §10.

If anything is wrong, `docker compose logs -f nginx` (or `backend` / `frontend`)
is the first place to look. §14 covers the failures that actually happen.

---

## 10. Update the external dashboards

The app is running, but three third-party services still think it lives on
`localhost`. None of these are code changes.

### Supabase — required, sign-in is broken without it

Google OAuth redirects back to `window.location.href`, so the deployed URL has
to be on Supabase's allowlist. In the Supabase dashboard →
**Authentication → URL Configuration**:

- **Site URL**: `https://vgai2.com`
- **Redirect URLs**: add `https://vgai2.com/**` (keep
  `http://localhost:3000/**` as well so local development still works)

You do **not** need to touch anything in the Google Cloud console — Google
redirects to Supabase's own `/auth/v1/callback`, which is unchanged.

### Razorpay

Add `vgai2.com` to the authorised domains for Checkout in the Razorpay
dashboard if your account has that restriction enabled. Nothing else is needed
for top-ups — `/payments/verify` is called from the browser and works as-is.

**Required before accepting live payments:** the Razorpay webhook is registered
in the backend. Add `https://vgai2.com/api/payments/webhook` in Razorpay Live
mode, select `payment.captured` and `payment.failed`, and put its secret in
`RAZORPAY_WEBHOOK_SECRET` in the root `.env`. Note the `/api` prefix — the
webhook hits the same proxy path as everything else. Apply
`vgai2admin/migration/004_atomic_razorpay_credit_settlement.sql` in Supabase
before enabling it; this makes the webhook and browser checkout verification
safe to run concurrently without adding credits twice.

### Database

Nothing to do. This deployment points at the same Supabase project you already
use, so `vgaidatabase_migration_credits.sql` and the style-template extras
migration are already applied. If you ever deploy against a *fresh* Supabase
project, run `vgaidatabase.sql` there first — every credit-spending endpoint
returns a 500 until the `spend_credits` / `refund_credits` / `add_project_expense`
functions exist.

---

## 11. Changing the domain later

You said `vgai.syp3.com` is temporary. Switching is four steps:

```bash
cd /opt/vgai

# 1. Point the new DNS A record at the same Elastic IP, and wait for it:
dig +short new-domain.com

# 2. Edit the one line:
nano .env                                # DOMAIN=new-domain.com

# 3. Issue a certificate for the new name. nginx is holding port 80, so use
#    the webroot method rather than standalone this time:
set -a; source .env; set +a
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$ACME_EMAIL" \
  --agree-tos --no-eff-email --non-interactive

# 4. Recreate the two services that read the domain:
docker compose up -d --force-recreate nginx backend
```

The frontend is deliberately **not** in that list: it calls the backend at the
relative `/api`, so no domain is compiled into its bundle and no rebuild is
needed. Do update the Supabase redirect URLs (§10) — that is the step people
forget, and the symptom is a login that bounces back signed-out.

Once the old domain is retired you can drop its certificate with
`docker compose run --rm --entrypoint certbot certbot delete --cert-name old-domain.com`.

---

## 12. Day-to-day operations

```bash
cd /opt/vgai

# Deploy new code
git pull
docker compose build            # add `frontend` or `backend` to build just one
docker compose up -d
docker image prune -f           # reclaim the superseded layers

# Logs
docker compose logs -f                    # everything
docker compose logs -f backend            # one service
docker compose logs --tail=200 nginx

# Restart / stop
docker compose restart backend
docker compose down                       # stop everything, keep volumes
docker compose up -d

# Check certificate status and test renewal without consuming a rate limit
docker compose run --rm --entrypoint certbot certbot certificates
docker compose run --rm --entrypoint certbot certbot renew \
  --webroot -w /var/www/certbot --dry-run

# Resource usage — worth a look after the first day of real traffic
docker stats --no-stream
df -h                                     # disk fills up with old images
```

**Only ever change configuration by editing `.env` and recreating** — never
`docker compose exec` a value into a running container, since it evaporates on
the next restart. Note that `NEXT_PUBLIC_*` changes need a `build`, not just an
`up -d`; everything else takes effect on recreate.

A `docker compose down -v` would delete named volumes. This stack deliberately
uses bind mounts (`./certbot/...`) for the certificates instead, so that flag
can't wipe them — but there is still no reason to pass it.

---

## 13. Alternative: build the images elsewhere

Building on the instance is simplest and keeps one source of truth, but it needs
2 GiB+ and takes ~10 minutes. If you'd rather keep a `t2.micro`, build on your
Windows machine and have EC2 only pull. You already have a Docker Hub account
(`mdk7866`).

> **Use `vgai2-*` tags, not `vgai-*`.** `mdk7866/vgai-backend` and
> `mdk7866/vgai-frontend` are the earlier MVP's images, and
> [`dockercommands.md`](./dockercommands.md) is that MVP's build reference —
> pushing to those tags would overwrite it. This stack uses `vgai2-backend` /
> `vgai2-frontend` everywhere, including `docker-compose.yml`.

On Windows:

```powershell
cd C:\Users\ASUS\OneDrive\Desktop\vgai2
docker login

# The frontend must be built with the real Supabase values — they are compiled in.
docker build -t mdk7866/vgai2-backend:latest ./backend
docker build -t mdk7866/vgai2-frontend:latest `
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" `
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>" `
  --build-arg NEXT_PUBLIC_BACKEND_URL="/api" `
  ./frontendweb

docker push mdk7866/vgai2-backend:latest
docker push mdk7866/vgai2-frontend:latest
```

On the instance, change the two `image:` lines in `docker-compose.yml` to
`mdk7866/vgai2-backend:latest` / `mdk7866/vgai2-frontend:latest`, delete or
comment out their `build:` blocks, then:

```bash
docker compose pull && docker compose up -d
```

Two caveats. Your Windows machine is `amd64` and so is a `t3.*` instance, so the
architectures match — but if you ever move to a Graviton (`t4g.*`) instance you
must build with `docker buildx build --platform linux/arm64`. And a public Docker
Hub repository makes the frontend image world-readable; the anon key inside it is
public by design, but keep the repository private anyway so you never have to
think about which key ended up where.

---

## 14. Troubleshooting

**nginx exits immediately, log says `cannot load certificate ... no such file`**
The certificate for the current `DOMAIN` doesn't exist. Either §8 wasn't run,
or `DOMAIN` was changed without §11 step 3. Check
`sudo ls /opt/vgai/certbot/conf/live/`.

**Certbot fails with "Timeout during connect" or "unauthorized"**
Port 80 isn't reachable from the internet. Check the security group has an
inbound rule for 80 from `0.0.0.0/0`, that `dig +short $DOMAIN` returns the
Elastic IP, and that nothing else is holding port 80
(`sudo ss -tlnp | grep :80`) during a standalone run.

**Site loads but every API call fails**
`curl https://vgai.syp3.com/api/health` from the instance. If that works but the
browser doesn't, the frontend was built with the wrong `NEXT_PUBLIC_BACKEND_URL`
— check the network tab for the URL it's actually calling, then
`docker compose build frontend && docker compose up -d frontend`.

**Frontend build fails with `Invalid supabaseUrl: Provided URL is malformed`**
`NEXT_PUBLIC_SUPABASE_URL` in `.env` is still the `<your-project-ref>`
placeholder, or is otherwise not a real URL. Next prerenders pages that build
the Supabase client at module scope, so it has to be valid at *build* time, not
just at run time.

**Frontend build fails with `npm ci ... Missing: @emnapi/runtime from lock file`**
The lockfile lost its Linux-only optional entries — see the regeneration snippet
in §2.

**`next build` is killed with exit code 137 / signal 9**
Out of memory. Confirm the swap file from §4 is active (`free -h`), or move to a
larger instance, or use §13.

**Login redirects back and the user is signed out**
Supabase redirect URLs (§10). The browser console usually shows the rejected
redirect target verbatim.

**Uploads fail with 413**
An asset larger than the `client_max_body_size 200M` in
`nginx/templates/default.conf.template`. Raise it there and
`docker compose restart nginx`.

**A long generation dies around 60 seconds**
That's nginx's default `proxy_read_timeout`, which this config already raises to
900s for `/api/`. If you see it, the container is running an older config —
`docker compose restart nginx` and re-check `docker compose logs nginx` for the
`nginx -t` line at startup.

**Everything returns a bare "Not Found"**
Familiar failure mode from local development, and worth remembering here too:
something other than this backend is answering on the port. On the server, check
`docker compose ps` and confirm the `nginx` container owns 80/443.

---

## 15. Worth doing once the site is live

Not required to deploy, but each is cheap and prevents a bad day:

- **Set a billing alarm** in AWS (Billing → Budgets) so an unexpected charge
  surfaces early.
- **Enable automated EBS snapshots** (EC2 → Lifecycle Manager) — the instance
  holds no user data (that's Supabase and Cloudinary), but rebuilding a host
  from scratch still costs an hour.
- **Restrict SSH to your current IP** and re-check it periodically if your ISP
  hands out dynamic addresses.
- **Watch the first certificate renewal** (~60 days in). It should be silent;
  `docker compose logs certbot` confirms it ran.
- **`sudo unattended-upgrades`** is enabled by default on Ubuntu Server for
  security patches — leave it on, and reboot occasionally to pick up kernel
  updates. The stack restarts itself.
