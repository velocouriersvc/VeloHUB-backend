#!/usr/bin/env bash
# Apply the Velo k8s stack on the NEW server. Run as root.
# Expects, in the current directory:
#   - velo-config.yaml  and  velo-secrets.yaml   (exported from the OLD cluster)
# and the repo manifests at $K8S (default /root/velo-k8s).
#
# Brings up Postgres/Redis/MinIO first. Restore the DB + MinIO data (Phase C) BEFORE
# starting the API, then re-run with APPLY_API=1 to launch the API.
#   ./02-deploy-stack.sh                 # data stores only
#   APPLY_API=1 ./02-deploy-stack.sh     # after data restore: start the API
set -euo pipefail
K8S="${K8S:-/root/velo-k8s}"

for f in velo-config.yaml velo-secrets.yaml; do
  [ -f "$f" ] || { echo "ERROR: $f not found. Export it from the OLD cluster first:"; \
    echo "  sudo kubectl -n velo get {secret velo-secrets|configmap velo-config} -o yaml > $f"; exit 1; }
  # strip cluster-specific metadata so apply succeeds on the new cluster
  sed -i '/resourceVersion:/d;/uid:/d;/creationTimestamp:/d' "$f"
done

kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f velo-config.yaml
kubectl apply -f velo-secrets.yaml
kubectl apply -f "$K8S/postgres.yaml"
kubectl apply -f "$K8S/redis.yaml"
kubectl apply -f "$K8S/minio.yaml"

echo "== Waiting for data stores =="
kubectl -n velo wait --for=condition=ready pod -l app=postgres --timeout=180s
kubectl -n velo wait --for=condition=ready pod -l app=minio --timeout=120s
kubectl -n velo wait --for=condition=ready pod -l app=redis --timeout=60s

if [ "${APPLY_API:-0}" = "1" ]; then
  echo "== Starting API =="
  kubectl apply -f "$K8S/velo-prod-deployment.yaml"
  kubectl apply -f "$K8S/api.yaml"
  kubectl -n velo rollout status deployment/velo-api --timeout=600s
  kubectl -n velo exec deploy/velo-api -- wget -qO- http://localhost:3000/health || true
  echo ""
  echo "API up. Continue with host nginx + certbot (Phase E) and DNS (Phase F)."
else
  echo ""
  echo "Data stores ready. Now restore the DB + MinIO (Phase C), then run: APPLY_API=1 ./02-deploy-stack.sh"
fi
