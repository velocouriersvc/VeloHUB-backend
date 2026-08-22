# Migration runbook: Contabo -> InterServer

Move the full self-hosted stack from Contabo (`38.242.149.20`) to InterServer (`162.35.106.11`) with zero
changes to the web and mobile apps. This works because every client targets the domain
`https://api.velocouriersvc.com` (never the IP) and the web app is hosted on Vercel (not the VPS), so the
cutover is a DNS A-record repoint plus re-issuing TLS on the new host.

## What moves and what does not

Moves (all on the VPS):

- k3s namespace `velo`: Postgres (10Gi PVC, db `velo`, user `postgres`), Redis (ephemeral), MinIO (bucket
  `velo-uploads`, 20Gi PVC), the API (Deployment `velo-api`, NodePort 30080).
- The admin dashboard (docker container `velo-frontend` on `:8080`).
- Monitoring (namespace `monitoring`: Prometheus/Grafana/Loki, Grafana NodePort 30300).
- Host nginx reverse proxy + Let's Encrypt certs for `api` / `admin` / `monitoring`.velocouriersvc.com.

Does NOT move:

- The web app (Vercel) and the mobile app (they only need the DNS repoint).
- The host mail server (`mail.velocouriersvc.com`): app email runs on external relays (Spacemail + Microsoft
  365), so it is out of scope. Leave the `mail` DNS record on Contabo, or drop it, as you prefer.

## Conventions

- `[NEW]` = run on InterServer (`ssh root@162.35.106.11`). `[OLD]` = run on Contabo. `[LOCAL]` = your machine.
- k3s ships kubectl as `sudo kubectl`. Postgres user/db are `postgres` / `velo` (from `k8s/configmap.yaml`).

---

## Phase 0 - Prep (do this first, a day before if possible)

1. `[LOCAL]` At your domain registrar, lower the TTL on the `api`, `admin`, `monitoring` A records to 300s
   (5 min) so the later cutover propagates fast. Do NOT change the IP yet.
2. `[LOCAL]` Note the current values so you can roll back: `api/admin/monitoring -> 38.242.149.20`.

## Phase A - Provision InterServer `[NEW]`

```bash
ssh root@162.35.106.11

# 1. Base packages
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx docker.io curl

# 2. k3s WITHOUT traefik (host nginx owns ports 80/443)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
# k3s installs /usr/local/bin/kubectl and writes /etc/rancher/k3s/k3s.yaml
sudo kubectl get nodes    # should show the node Ready

# 3. Deploy user for GitHub Actions CI (backend + admin deploy over SSH)
adduser --disabled-password --gecos "" deploy
usermod -aG sudo,docker deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

Then create the CI SSH key `[LOCAL]` and install the public half on the server:

```bash
# [LOCAL] generate a dedicated CI key (no passphrase)
ssh-keygen -t ed25519 -f velo-ci-key -N "" -C "velo-ci"
# copy velo-ci-key.pub content, then on [NEW]:
#   echo "ssh-ed25519 AAAA...velo-ci" >> /home/deploy/.ssh/authorized_keys
#   chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Keep `velo-ci-key` (private) for Phase G (GitHub secrets).

## Phase B - Copy manifests + live config/secrets, bring up data stores

```bash
# [LOCAL] send the k8s manifests to the new server
cd VeloHUB-backend
scp -r k8s root@162.35.106.11:/root/velo-k8s

# [OLD] export the LIVE secret + configmap (they hold values the CI has patched in)
ssh root@38.242.149.20
sudo kubectl -n velo get secret velo-secrets -o yaml > /root/velo-secrets.yaml
sudo kubectl -n velo get configmap velo-config -o yaml > /root/velo-config.yaml
exit
# copy them across (via your machine)
scp root@38.242.149.20:/root/velo-secrets.yaml root@38.242.149.20:/root/velo-config.yaml /tmp/
scp /tmp/velo-secrets.yaml /tmp/velo-config.yaml root@162.35.106.11:/root/
```

```bash
# [NEW] strip cluster-specific metadata, then apply everything
ssh root@162.35.106.11
cd /root
for f in velo-secrets.yaml velo-config.yaml; do
  sudo kubectl -n velo create -f /dev/null 2>/dev/null || true
  sed -i '/resourceVersion:/d; /uid:/d; /creationTimestamp:/d' "$f"
done
sudo kubectl apply -f velo-k8s/namespace.yaml
sudo kubectl apply -f velo-config.yaml
sudo kubectl apply -f velo-secrets.yaml
sudo kubectl apply -f velo-k8s/postgres.yaml
sudo kubectl apply -f velo-k8s/redis.yaml
sudo kubectl apply -f velo-k8s/minio.yaml
sudo kubectl -n velo wait --for=condition=ready pod -l app=postgres --timeout=180s
sudo kubectl -n velo wait --for=condition=ready pod -l app=minio --timeout=120s
sudo kubectl -n velo wait --for=condition=ready pod -l app=redis --timeout=60s
```

## Phase C - Migrate the data (maintenance window)

Start of window: stop writes on the old cluster so the dump is consistent.

```bash
# [OLD] stop the API so no new writes happen
sudo kubectl -n velo scale deployment velo-api --replicas=0

# [OLD] dump the database from inside the postgres pod
POD=$(sudo kubectl -n velo get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}')
sudo kubectl -n velo exec "$POD" -- sh -c 'pg_dump -U postgres -Fc velo' > /root/velo.dump
ls -lh /root/velo.dump
exit
# move the dump to the new server (via your machine)
scp root@38.242.149.20:/root/velo.dump /tmp/ && scp /tmp/velo.dump root@162.35.106.11:/root/
```

```bash
# [NEW] restore into the fresh postgres (drops/recreates objects with --clean)
POD=$(sudo kubectl -n velo get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}')
sudo kubectl -n velo exec -i "$POD" -- pg_restore -U postgres -d velo --clean --if-exists < /root/velo.dump
# sanity: row counts
sudo kubectl -n velo exec "$POD" -- psql -U postgres -d velo -c \
  'select (select count(*) from users) users, (select count(*) from orders) orders, (select count(*) from rides) rides;'
```

MinIO objects (`velo-uploads`) - mirror old -> new using the MinIO client `mc` with a port-forward on each
side. Read `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from the secret first.

```bash
# creds (same on both, they came from the copied secret):
sudo kubectl -n velo get secret velo-secrets -o jsonpath='{.data.MINIO_ROOT_USER}' | base64 -d; echo
sudo kubectl -n velo get secret velo-secrets -o jsonpath='{.data.MINIO_ROOT_PASSWORD}' | base64 -d; echo

# [OLD] expose MinIO API locally and mirror OUT to the new server's MinIO.
# Simplest reliable path: port-forward on OLD, run mc there with two aliases.
curl -sSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc
sudo kubectl -n velo port-forward svc/minio-service 9000:9000 >/tmp/pf-old.log 2>&1 &
# For the NEW target, temporarily expose its MinIO API on a NodePort or use an SSH tunnel from OLD:
#   ssh -N -L 9100:127.0.0.1:9000 root@162.35.106.11 &   (after port-forwarding svc/minio-service 9000 on NEW)
mc alias set old  http://127.0.0.1:9000 "$MINIO_USER" "$MINIO_PASS"
mc alias set new  http://127.0.0.1:9100 "$MINIO_USER" "$MINIO_PASS"
mc mb --ignore-existing new/velo-uploads
mc mirror --overwrite old/velo-uploads new/velo-uploads
```

Redis holds only ephemeral data (cache, live driver locations, short-lived OTPs) - nothing to migrate.

## Phase D - Bring up the API + monitoring `[NEW]`

```bash
# If the GHCR package is private, create the pull secret (else skip - public pulls anonymously):
#   sudo kubectl -n velo create secret docker-registry regcred \
#     --docker-server=ghcr.io --docker-username=velocouriersvc --docker-password=<GHCR_PAT>

sudo kubectl apply -f velo-k8s/velo-prod-deployment.yaml
sudo kubectl apply -f velo-k8s/api.yaml
sudo kubectl -n velo rollout status deployment/velo-api --timeout=600s
sudo kubectl -n velo exec deploy/velo-api -- wget -qO- http://localhost:3000/health

# Monitoring: re-apply the manifests documented in docs/MONITORING.md (namespace `monitoring`),
# then confirm Grafana is on NodePort 30300.
sudo kubectl -n monitoring get svc
```

Admin container:

```bash
# [NEW] build + run the admin image (the admin CI will manage it after Phase G; this is the first bring-up)
# Fastest: just let the admin GitHub Action deploy it in Phase G. To do it by hand:
#   scp the velo-admin repo to /home/deploy/apps/velo-admin/src, then:
#   docker build --build-arg VITE_API_KEY=<API_KEY> -t velo-frontend:latest .
#   docker run -d -p 8080:80 --name velo-frontend --restart=always velo-frontend:latest
```

## Phase E - Host nginx + TLS `[NEW]`

```bash
# API, admin, monitoring server blocks (see k8s/nginx/*.conf in the repo copy at /root/velo-k8s/nginx)
cp /root/velo-k8s/nginx/velo-api.conf        /etc/nginx/sites-available/api.velocouriersvc.com
cp /root/velo-k8s/migrate/nginx-admin.conf   /etc/nginx/sites-available/admin.velocouriersvc.com
cp /root/velo-k8s/migrate/nginx-monitoring.conf /etc/nginx/sites-available/monitoring.velocouriersvc.com
ln -sf /etc/nginx/sites-available/api.velocouriersvc.com        /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/admin.velocouriersvc.com      /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/monitoring.velocouriersvc.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
# TLS is issued in Phase F, AFTER DNS points here.
```

## Phase F - DNS repoint (registrar) `[LOCAL]`

Change the A records at your registrar:

| Host | Type | Old value | New value |
|------|------|-----------|-----------|
| api.velocouriersvc.com | A | 38.242.149.20 | 162.35.106.11 |
| admin.velocouriersvc.com | A | 38.242.149.20 | 162.35.106.11 |
| monitoring.velocouriersvc.com | A | 38.242.149.20 | 162.35.106.11 |

Wait for propagation (`nslookup api.velocouriersvc.com` shows the new IP), then issue certs `[NEW]`:

```bash
certbot --nginx -d api.velocouriersvc.com -d admin.velocouriersvc.com -d monitoring.velocouriersvc.com \
  --non-interactive --agree-tos -m admin@velocouriersvc.com --redirect
systemctl reload nginx
```

## Phase G - Repoint CI to the new host

In BOTH GitHub repos set the deploy secrets, then push to redeploy cleanly onto the new host.

- `velocouriersvc/VeloHUB-backend`: `VPS_HOST=162.35.106.11`, `VPS_USER=deploy`, `VPS_PORT=22`,
  `VPS_SSH_KEY=<contents of velo-ci-key>`.
- `velocouriersvc/velo-admin`: `SERVER_HOST=162.35.106.11`, `SERVER_USER=deploy`, `SERVER_PORT=22`,
  `SERVER_SSH_KEY=<contents of velo-ci-key>` (the workflow default IP is already updated to the new server).

Trigger both (empty commit or the "Run workflow" button). The backend Action patches config/secrets + rolls
the API; the admin Action builds + runs `velo-frontend` on `:8080`.

## Phase H - Verify (E2E)

```bash
nslookup api.velocouriersvc.com                 # -> 162.35.106.11
curl -s https://api.velocouriersvc.com/health   # -> 200 OK, valid Let's Encrypt cert
```

- `admin.velocouriersvc.com` loads and lists live data (users, orders, merchants).
- A known uploaded image loads via `https://api.velocouriersvc.com/velo-uploads/...` (MinIO mirrored).
- DB row counts match the pre-cutover numbers from Phase C.
- `monitoring.velocouriersvc.com` (Grafana) loads.
- Open the mobile app and the Vercel web app: both work unchanged (same domain, new backend).

## Phase I - Decommission + rollback

- Keep Contabo powered on and untouched for a soak period (a few days). Rollback = revert the 3 A records to
  `38.242.149.20` and scale the Contabo API back up (`kubectl -n velo scale deployment velo-api --replicas=2`).
- Once satisfied, decommission Contabo.
