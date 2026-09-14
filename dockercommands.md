# vgAI2 Docker build and push commands

Run this on your **Windows computer in PowerShell**, with Docker Desktop running in Linux-container mode. Images already published do not need rebuilding for the first EC2 deployment.

For all EC2 setup commands, use [DOCKERHUB_DEPLOY.md](./DOCKERHUB_DEPLOY.md).

## 1. Sign in

```powershell
Set-Location 'C:\Users\ASUS\OneDrive\Desktop\vgai2'
docker login --username mdk7866
if ($LASTEXITCODE -ne 0) { throw 'Docker login failed' }
```

## 2. Build

Enter the two **public** values from `frontendweb/.env.local` when prompted. Never enter the Supabase secret/service-role key. Backend credentials are supplied only on EC2 through its root `.env`.

```powershell
$vgaiPublicUrl = Read-Host 'NEXT_PUBLIC_SUPABASE_URL'
$vgaiPublicKey = Read-Host 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
if (-not $vgaiPublicUrl.StartsWith('https://') -or [string]::IsNullOrWhiteSpace($vgaiPublicKey)) {
    throw 'Enter the real public Supabase URL and public key'
}

docker build --platform linux/amd64 -t mdk7866/vgai2-backend:latest ./backend
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed; do not push' }

docker build --platform linux/amd64 -t mdk7866/vgai2-frontend:latest `
  --build-arg "NEXT_PUBLIC_SUPABASE_URL=$vgaiPublicUrl" `
  --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$vgaiPublicKey" `
  --build-arg "NEXT_PUBLIC_BACKEND_URL=/api" `
  ./frontendweb
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; do not push' }
```

## 3. Push after both builds succeed

These commands replace the `latest` tags for vgAI2:

```powershell
docker push mdk7866/vgai2-backend:latest
if ($LASTEXITCODE -ne 0) { throw 'Backend push failed' }
docker push mdk7866/vgai2-frontend:latest
if ($LASTEXITCODE -ne 0) { throw 'Frontend push failed' }
```

## 4. Update an already-deployed EC2 site

Run in the **EC2 Ubuntu terminal**, only after initial deployment is complete:

```bash
cd /opt/vgai
sudo docker compose -f compose.deploy.yaml pull
sudo docker compose -f compose.deploy.yaml up -d
sudo docker compose -f compose.deploy.yaml restart nginx
curl --fail --retry 12 --retry-connrefused --retry-delay 5 https://vgai2.com/api/health
```

Keep `nginx/templates/default.conf.template`: Compose mounts it for HTTPS and routing. Restarting nginx after image updates refreshes application container addresses.

[Docker build command reference](https://docs.docker.com/reference/cli/docker/buildx/build/)




