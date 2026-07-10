# Docker Commands Reference

This document contains instructions to build, run, and push the Docker images for the vgAI application.

## Prerequisites
- Ensure you are in the project root directory (`c:\Users\ASUS\OneDrive\Desktop\vgai`) before executing these commands.
- **IMPORTANT**: Ensure your Docker Engine (e.g., Docker Desktop) is running. If you get a connection pipe error, open Docker Desktop and wait for the engine to start up.

---

## 1. Authentication
Log in to your Docker Hub account (`mdk7866`):
```bash
docker login
```
*(If you are already logged in, this will verify and authenticate with your existing credentials)*

---

## 2. Build the Docker Images
Build the backend and frontend Docker images using the Dockerfiles in their respective directories:

### Backend Image
```bash
docker build -t mdk7866/vgai-backend:latest ./backend
```

### Frontend Image
```bash
docker build -t mdk7866/vgai-frontend:latest ./frontendweb
```

---

## 3. Push to Docker Hub
Upload the newly built images to Docker Hub for remote storage or deployment:

### Push Backend
```bash
docker push mdk7866/vgai-backend:latest
```

### Push Frontend
```bash
docker push mdk7866/vgai-frontend:latest
```




