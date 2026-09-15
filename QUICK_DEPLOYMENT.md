# Quick deployment update — vgAI2

Use this after you make code changes on your Windows computer and want them live at https://vgai2.com.

## 1. Check and commit the code on Windows

```powershell
Set-Location 'C:\Users\ASUS\OneDrive\Desktop\vgai2'
git status
git add <the-files-you-changed>
git commit -m "Describe the change"
git push origin main
```

Do not add `.env`, `backend/.env`, or `frontendweb/.env.local`.

## 2. Build and push new Docker images on Windows

Start Docker Desktop first. When asked, enter the two **public** values from `frontendweb/.env.local`. Do not enter the Supabase service-role key or any backend secret.

```powershell
Set-Location 'C:\Users\ASUS\OneDrive\Desktop\vgai2'
docker login --username mdk7866

$vgaiPublicUrl = Read-Host 'NEXT_PUBLIC_SUPABASE_URL'
$vgaiPublicKey = Read-Host 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

docker build --platform linux/amd64 -t mdk7866/vgai2-backend:latest ./backend
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }

docker build --platform linux/amd64 -t mdk7866/vgai2-frontend:latest `
  --build-arg "NEXT_PUBLIC_SUPABASE_URL=$vgaiPublicUrl" `
  --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$vgaiPublicKey" `
  --build-arg "NEXT_PUBLIC_BACKEND_URL=/api" `
  ./frontendweb
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }

docker push mdk7866/vgai2-backend:latest
docker push mdk7866/vgai2-frontend:latest
```

If you changed only backend files, build and push only `vgai2-backend`. If you changed only frontend files, build and push only `vgai2-frontend`. Changes to nginx, `compose.deploy.yaml`, or deployment documentation need `git pull` on EC2 but do not require an application image rebuild.

## 3. Pull and restart on EC2

SSH into EC2 and run:

```bash
cd /opt/vgai
git pull --ff-only
sudo docker compose -f compose.deploy.yaml pull
sudo docker compose -f compose.deploy.yaml up -d
sudo docker compose -f compose.deploy.yaml restart nginx
sudo docker compose -f compose.deploy.yaml ps
curl --fail --retry 12 --retry-connrefused --retry-delay 5 https://vgai2.com/api/health
```

Visit https://vgai2.com and test the changed feature.

## If a deployment fails

```bash
cd /opt/vgai
sudo docker compose -f compose.deploy.yaml logs --tail=100 backend frontend nginx
```

Do not run `docker compose down -v`: it is not needed for updates and can remove Docker-managed data. Keep `/opt/vgai/.env` and `/opt/vgai/certbot/`.
