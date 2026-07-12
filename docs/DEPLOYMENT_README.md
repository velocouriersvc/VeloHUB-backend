VeloHub - K8s production deployment (pull image from GitHub Container Registry)

This guide shows how to deploy the backend to the `velo` namespace using images published to GitHub Container Registry (GHCR). It creates an image pull secret, deploys Redis and MinIO, and deploys the API using the registry image. It also describes how to inject environment variables and secrets.

Prerequisites on the VPS:
- `kubectl` configured and pointing to the cluster (K3s: export KUBECONFIG=/etc/rancher/k3s/k3s.yaml)
- `docker` installed (not required for pulling images inside cluster)
- `kubectl` and `helm` available (optional)

Checklist
- [ ] Create `regcred` for GHCR (image pull secret)
- [ ] Update `k8s/secrets.yaml` with production secrets (base64 or kubectl create secret)
- [ ] Apply `k8s/postgres.yaml` → `k8s/redis.yaml` → `k8s/minio.yaml`
- [ ] Apply `k8s/velo-prod-deployment.yaml`
- [ ] Apply `k8s/api.yaml` (service)

1) Create image pull secret (GHCR)

Replace `<GITHUB_USER>` and `<PERSONAL_ACCESS_TOKEN>` below. The token needs `read:packages` permission.

```bash
kubectl -n velo create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username=<GITHUB_USER> \
  --docker-password=<PERSONAL_ACCESS_TOKEN>
```

2) Secrets & Config

You already have `k8s/configmap.yaml` and `k8s/secrets.yaml`. Edit `k8s/secrets.yaml` and fill base64 values or use `kubectl create secret generic` commands instead.

Example (preferred, avoids exposing base64 in files):

```bash
kubectl -n velo create secret generic velo-secrets \
  --from-literal=DB_PASSWORD='your-db-pass' \
  --from-literal=API_KEY='your-api-key' \
  --from-literal=PAYSTACK_SECRET_KEY='sk_live_xxx' \
  --from-literal=GOOGLE_MAPS_API_KEY='xxx' \
  --from-literal=TWILIO_ACCOUNT_SID='ACxxx' \
  --from-literal=TWILIO_AUTH_TOKEN='xxx' \
  --from-literal=TWILIO_PHONE_NUMBER='+233...' \
  --from-literal=MINIO_ROOT_USER='minio-user' \
  --from-literal=MINIO_ROOT_PASSWORD='minio-pass'
```

3) Deploy Redis & Postgres & MinIO (order matters)

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/minio.yaml

kubectl -n velo wait --for=condition=ready pod -l app=postgres --timeout=180s
kubectl -n velo wait --for=condition=ready pod -l app=redis --timeout=60s
kubectl -n velo wait --for=condition=ready pod -l app=minio --timeout=60s
```

4) Deploy API (pulling from GHCR)

```bash
kubectl apply -f k8s/velo-prod-deployment.yaml
kubectl -n velo wait --for=condition=available deployment/velo-api --timeout=120s
```

5) Expose API via NodePort or Ingress

You already have `k8s/api.yaml` which creates a `NodePort` service `velo-api-nodeport` on `30080`. Nginx on the VPS proxies to `http://127.0.0.1:30080`.

6) Verify

```bash
kubectl -n velo get pods
kubectl -n velo get svc
kubectl -n velo logs deployment/velo-api -c velo-api --tail=200
kubectl -n velo describe deploy/velo-api
```

Notes & recommendations
- Use `kubectl create secret docker-registry regcred` with a GitHub PAT that has `read:packages` permission.
- Prefer `kubectl create secret generic velo-secrets --from-literal=...` to avoid storing secrets in repo.
- Consider using `PersistentVolumes` that map to block storage on the VPS (see `k8s/postgres.yaml` and `k8s/minio.yaml` for PVCs). If you're using a cloud provider, create PVs with appropriate storage class.
- For production, use an ingress (NGINX-ingress or Traefik) and TLS certificates (Certbot or cert-manager). For a single-node K3s, Nginx reverse proxy on host is fine.

If you want, I can also:
- Convert `k8s/minio.yaml` to a MinIO Helm chart install command
- Add a `Secret` manifest for GHCR using `kubectl create secret docker-registry` template
- Add an `Ingress` resource and instructions to generate TLS via cert-manager

--
Generated from repository state on 2026-03-04


emma24@velo-prod:~/velo-api/k8s$ sudo kubectl -n velo get svc
NAME                TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)             AGE
minio-console       NodePort    10.43.49.119    <none>        9001:30901/TCP      4m30s
minio-service       ClusterIP   10.43.209.206   <none>        9000/TCP,9001/TCP   4m30s
postgres-service    ClusterIP   None            <none>        5432/TCP            6m13s
redis-service       ClusterIP   10.43.223.171   <none>        6379/TCP            4m58s
velo-api-nodeport   NodePort    10.43.126.220   <none>        3000:30080/TCP      106s
velo-api-service    ClusterIP   10.43.66.98     <none>        3000/TCP            106s