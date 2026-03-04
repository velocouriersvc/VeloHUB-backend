# VeloHub VPS Setup — Step by Step

> **OS:** Ubuntu 22.04 or 24.04 LTS
> **Login:** SSH as root
> **Goal:** Prepare the VPS with Docker, K3s, Nginx, and basic firewall — ready for K8s deployment

⚠️ **READ EACH STEP FULLY BEFORE RUNNING.** Firewall steps are written carefully so you don't lock yourself out.

---

## Step 1 — SSH in and update

```bash
ssh root@YOUR_VPS_IP
```

```bash
apt update && apt upgrade -y
```

Don't reboot yet. If the kernel was upgraded, we'll reboot after the firewall is safe.

---

## Step 2 — Confirm SSH works on port 22

```bash
# Check what port sshd is running on
grep -i "^Port" /etc/ssh/sshd_config
```

If it says `Port 22` or nothing (22 is default), you're good. If it says something else, note that port.

Make sure root login is enabled:

```bash
grep -i "PermitRootLogin" /etc/ssh/sshd_config
```

If it says `no` or `prohibit-password`, fix it:

```bash
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

**TEST:** Open a **new terminal** and SSH in again before continuing. If it works, keep going.

---

## Step 3 — Firewall (UFW) — THE CAREFUL WAY

This is where you got locked out before. We do this in a safe order:

### 3.1 — Allow SSH FIRST (before enabling the firewall)

```bash
apt install ufw -y
```

```bash
# Allow SSH on BOTH ports so you can never get locked out
ufw allow 22/tcp
ufw allow 2222/tcp
```

### 3.2 — Allow the ports the backend needs

```bash
ufw allow 80/tcp       # Nginx HTTP
ufw allow 443/tcp      # Nginx HTTPS (SSL)
ufw allow 30080/tcp    # K8s NodePort → Velo API (Nginx proxies to this)
ufw allow 30901/tcp    # K8s NodePort → MinIO Console
ufw allow 6443/tcp     # K8s API server
```

### 3.3 — Set default policy to deny everything else

```bash
ufw default deny incoming
ufw default allow outgoing
```

### 3.4 — Enable the firewall

```bash
ufw enable
```

It will ask "Command may disrupt existing SSH connections. Proceed?" → Type `y`.

**You won't get kicked out because we already allowed port 22 and 2222.**

### 3.5 — Verify

```bash
ufw status verbose
```

You should see:

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
2222/tcp                   ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
30080/tcp                  ALLOW       Anywhere
30901/tcp                  ALLOW       Anywhere
6443/tcp                   ALLOW       Anywhere
```

### 3.6 — SAFETY CHECK

Open a **brand new terminal** and SSH in again:

```bash
ssh root@YOUR_VPS_IP
```

**If it works → you're safe. Continue.**
**If it doesn't → DO NOT close your current session. Run `ufw disable` to recover.**

---

## Step 4 — Fail2Ban (blocks brute-force SSH attempts)

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

That's it. Default config protects SSH. Nothing else to configure.

---

## Step 5 — Reboot (if kernel was upgraded in Step 1)

```bash
reboot
```

SSH back in after ~30 seconds:

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 6 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

Verify:

```bash
docker --version
```

Quick test:

```bash
docker run --rm hello-world
```

You should see "Hello from Docker!" — then move on.

---

## Step 7 — Install K3s (Lightweight Kubernetes)

```bash
curl -sfL https://get.k3s.io | sh -
```

This installs:
- K3s (single-node Kubernetes cluster)
- `kubectl` (bundled)
- Starts the cluster automatically

### Set up kubectl access

```bash
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

### Verify the cluster is running

```bash
kubectl get nodes
```

You should see 1 node with status `Ready`:

```
NAME        STATUS   ROLES                  AGE   VERSION
your-vps    Ready    control-plane,master   30s   v1.xx.x+k3s1
```

---

## Step 8 — Install Nginx

```bash
apt install nginx -y
systemctl enable nginx
```

We'll configure the Nginx site later once the API is deployed. For now just make sure it's installed:

```bash
nginx -v
```

---

## Step 9 — Install Certbot (for SSL later)

```bash
apt install certbot python3-certbot-nginx -y
```

We'll use this after the subdomain is pointed to the VPS.

---

## Step 10 — Install Git (if not already there)

```bash
apt install git -y
git --version
```

---

## Step 11 — Create the Velo K8s Namespace

```bash
kubectl create namespace velo
```

Verify:

```bash
kubectl get namespaces
```

You should see `velo` in the list.

---

## Step 12 — Verify Everything Is Installed

Run this whole block — it checks everything at once:

```bash
echo "=== System ==="
uname -r
echo ""
echo "=== Docker ==="
docker --version
echo ""
echo "=== K3s / Kubectl ==="
kubectl version --short 2>/dev/null || kubectl version
echo ""
echo "=== Nginx ==="
nginx -v
echo ""
echo "=== Certbot ==="
certbot --version
echo ""
echo "=== Git ==="
git --version
echo ""
echo "=== UFW ==="
ufw status
echo ""
echo "=== K8s Nodes ==="
kubectl get nodes
echo ""
echo "=== K8s Namespaces ==="
kubectl get namespaces
echo ""
echo "✅ VPS is ready for deployment"
```

---

## What's Installed

| Software | Purpose |
|----------|---------|
| Docker | Build container images |
| K3s | Lightweight Kubernetes (runs Postgres, Redis, MinIO, API) |
| kubectl | Manage K8s cluster (bundled with K3s) |
| Nginx | Reverse proxy — routes `api.yourdomain.com` → K8s API |
| Certbot | Free SSL certs from Let's Encrypt |
| UFW | Firewall |
| Fail2Ban | Blocks brute-force SSH attempts |
| Git | Clone the backend repo |

## Open Ports

| Port | What |
|------|------|
| 22 | SSH |
| 2222 | SSH fallback |
| 80 | HTTP (Nginx) |
| 443 | HTTPS (Nginx + SSL) |
| 30080 | K8s → API (Nginx proxies here) |
| 30901 | MinIO web console |
| 6443 | K8s API server |
| **Everything else** | **BLOCKED** |

---

## What's Next

Once all 12 steps pass, come back here and paste the output of Step 12.

We'll then:
1. Clone the repo onto the VPS
2. Build the Docker image
3. Fill in K8s secrets (real API keys, passwords)
4. Apply all K8s manifests (Postgres → Redis → MinIO → API)
5. Configure Nginx for your subdomain
6. Get SSL with certbot
7. Test the live API

**Paste the output of Step 12 when you're done.**
