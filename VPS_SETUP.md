# VeloHub VPS Setup Guide

> Tested on Ubuntu 22.04/24.04 LTS. Run everything as root.

---

## 1. Initial System Update

```bash
apt update && apt upgrade -y
reboot
```

---

## 2. Basic Security (Light — Root Stays Enabled)

### 2.1 SSH Config

Edit `/etc/ssh/sshd_config`:

```bash
nano /etc/ssh/sshd_config
```

Make sure these lines exist:

```
Port 22
PermitRootLogin yes
PasswordAuthentication yes
```

Restart SSH:

```bash
systemctl restart sshd
```

### 2.2 Firewall (UFW)

```bash
apt install ufw -y

# Allow essentials
ufw allow 22/tcp       # SSH
ufw allow 2222/tcp     # Reserved for custom SSH / future use
ufw allow 80/tcp       # HTTP (Nginx)
ufw allow 443/tcp      # HTTPS (Nginx + Certbot)
ufw allow 30080/tcp    # K8s NodePort → Velo API
ufw allow 30901/tcp    # K8s NodePort → MinIO Console
ufw allow 6443/tcp     # K8s API server (kubectl)

ufw enable
ufw status
```

### 2.3 Fail2Ban (basic brute-force protection)

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

No custom config needed — defaults protect SSH out of the box.

---

## 3. Install Docker

```bash
# Remove old versions
apt remove docker docker-engine docker.io containerd runc -y 2>/dev/null

# Install via official script
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker run hello-world
```

---

## 4. Install K3s (Lightweight Kubernetes)

> K3s is a production-ready, single-binary Kubernetes distro — perfect for a VPS. No need for full K8s or minikube.

```bash
curl -sfL https://get.k3s.io | sh -

# Verify
kubectl get nodes
```

K3s automatically:
- Installs `kubectl`
- Sets up a single-node cluster
- Provides a built-in ingress controller (Traefik — we'll use Nginx instead)
- Manages `containerd` as the runtime

### Fix kubeconfig for convenience

```bash
# K3s puts config at /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
```

### Verify cluster

```bash
kubectl get nodes
# Should show 1 node in Ready state
```

---

## 5. Install Nginx (Reverse Proxy)

```bash
apt install nginx -y
systemctl enable nginx
```

### Copy the velo-api config

```bash
# From your local machine, scp the config:
# scp k8s/nginx/velo-api.conf root@<VPS_IP>:/etc/nginx/sites-available/velo-api

# Or paste it directly on the VPS:
nano /etc/nginx/sites-available/velo-api
```

Paste the contents of `k8s/nginx/velo-api.conf`, then update the `server_name` to your actual subdomain.

```bash
ln -s /etc/nginx/sites-available/velo-api /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default   # remove default page
nginx -t                               # test config
systemctl reload nginx
```

---

## 6. Point Your Subdomain

Go to your domain registrar (Namecheap, Cloudflare, etc.) and add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A    | api  | `<YOUR_VPS_IP>` | Auto |

This creates `api.yourdomain.com` → your VPS.

Wait a few minutes for DNS propagation, then test:

```bash
ping api.yourdomain.com
# Should resolve to your VPS IP
```

---

## 7. SSL Certificate (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx -y

certbot --nginx -d api.yourdomain.com
```

Follow the prompts. Certbot will auto-update the Nginx config with SSL.

Auto-renewal is set up by default. Verify:

```bash
certbot renew --dry-run
```

---

## 8. Deploy the Backend

### 8.1 Get the code onto the VPS

```bash
# Option A: Git clone
git clone https://github.com/velocouriersvc/velo-hub-backend.git
cd velo-hub-backend
git checkout rides

# Option B: SCP from local
# scp -r ./velo-backend root@<VPS_IP>:/root/velo-backend
```

### 8.2 Build the Docker image on the VPS

```bash
cd /root/velo-hub-backend   # or wherever you cloned it
docker build -t velo-backend:latest .
```

### 8.3 Edit secrets

```bash
nano k8s/secrets.yaml
```

Replace ALL the base64 placeholder values with your real secrets:

```bash
# How to encode:
echo -n "my-real-password" | base64

# How to decode (to verify):
echo "bXktcmVhbC1wYXNzd29yZA==" | base64 -d
```

**Must fill in:** `DB_PASSWORD`, `API_KEY`, `PAYSTACK_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`, `MINIO_ROOT_PASSWORD`

### 8.4 Apply K8s manifests

```bash
chmod +x k8s/deploy.sh
./k8s/deploy.sh
```

### 8.5 Verify everything is running

```bash
kubectl -n velo get pods
```

Expected output:

```
NAME                        READY   STATUS    RESTARTS   AGE
postgres-0                  1/1     Running   0          2m
redis-xxxxx-xxxxx           1/1     Running   0          2m
minio-xxxxx-xxxxx           1/1     Running   0          2m
velo-api-xxxxx-xxxxx        1/1     Running   0          1m
velo-api-xxxxx-yyyyy        1/1     Running   0          1m
```

```bash
kubectl -n velo get svc
```

### 8.6 Test the API

```bash
curl http://localhost:30080
# → {"message":"Velo Backend API is running!"}

curl https://api.yourdomain.com
# → {"message":"Velo Backend API is running!"}
```

---

## 9. MinIO Setup

### 9.1 Access the Console

Open `http://<VPS_IP>:30901` in your browser.

Login with the credentials from your secrets:
- **User:** velo-admin (or whatever you set)
- **Password:** your MINIO_ROOT_PASSWORD

### 9.2 Create the Bucket

1. Click **Buckets** → **Create Bucket**
2. Name: `velo-uploads`
3. Leave defaults, click **Create**

### 9.3 Set Bucket Policy (public read for images)

1. Click the bucket → **Access Policy** → **Custom**
2. Paste this policy to allow public read:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::velo-uploads/*"]
    }
  ]
}
```

This means uploaded images/files are readable by anyone (good for profile photos, license images, etc.), but only the backend can write.

---

## 10. Useful Commands

### Logs

```bash
# API logs
kubectl -n velo logs -f deployment/velo-api

# Postgres logs
kubectl -n velo logs -f statefulset/postgres

# Redis logs
kubectl -n velo logs -f deployment/redis

# MinIO logs
kubectl -n velo logs -f deployment/minio
```

### Restart a deployment

```bash
kubectl -n velo rollout restart deployment/velo-api
```

### Redeploy after code changes

```bash
docker build -t velo-backend:latest .
kubectl -n velo rollout restart deployment/velo-api
```

### Shell into a pod

```bash
# API
kubectl -n velo exec -it deployment/velo-api -- sh

# Postgres
kubectl -n velo exec -it postgres-0 -- psql -U postgres -d velo

# Redis
kubectl -n velo exec -it deployment/redis -- redis-cli
```

### Delete everything and start over

```bash
kubectl delete namespace velo
# Then re-run deploy.sh
```

---

## 11. Port Summary

| Port | Service | Accessible From |
|------|---------|----------------|
| 22   | SSH | Anywhere |
| 2222 | Reserved (alt SSH / future) | Anywhere |
| 80   | Nginx HTTP | Anywhere |
| 443  | Nginx HTTPS | Anywhere |
| 30080 | K8s → Velo API | localhost + Nginx |
| 30901 | K8s → MinIO Console | Your browser |
| 6443 | K8s API server | localhost |
| 5432 | Postgres | Internal cluster only |
| 6379 | Redis | Internal cluster only |
| 9000 | MinIO API | Internal cluster only |

---

## 12. Installed Software Summary

| Software | Purpose | Install Method |
|----------|---------|---------------|
| Docker | Container runtime | `get.docker.com` script |
| K3s | Lightweight Kubernetes | `get.k3s.io` script |
| kubectl | K8s CLI (bundled with K3s) | — |
| Nginx | Reverse proxy + SSL termination | apt |
| Certbot | Free SSL certificates | apt |
| UFW | Firewall | apt |
| Fail2Ban | Brute-force protection | apt |
| Git | Clone repo | apt (usually pre-installed) |
