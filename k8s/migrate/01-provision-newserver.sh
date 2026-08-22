#!/usr/bin/env bash
# Provision a fresh InterServer host for the Velo stack. Run as root on the NEW server.
# Installs nginx + certbot + docker + k3s (traefik disabled so host nginx owns 80/443)
# and creates the CI deploy user. Idempotent - safe to re-run.
set -euo pipefail

echo "== Installing base packages =="
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx docker.io curl

echo "== Installing k3s (traefik disabled so host nginx owns ports 80/443) =="
if ! command -v k3s >/dev/null 2>&1; then
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
fi
kubectl get nodes

echo "== Creating CI deploy user =="
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG sudo,docker deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh

echo ""
echo "DONE."
echo "Next:"
echo "  1. Append your CI public key to /home/deploy/.ssh/authorized_keys"
echo "     (chown deploy:deploy it, chmod 600), then test: ssh deploy@162.35.106.11"
echo "  2. Copy the k8s manifests + exported velo-config.yaml/velo-secrets.yaml here,"
echo "     then run 02-deploy-stack.sh"
