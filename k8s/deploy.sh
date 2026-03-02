#!/bin/bash
# deploy.sh — Build, push, and apply all K8s manifests
# Run from the velo-backend directory

set -e

echo "🐳 Building Docker image..."
docker build -t velo-backend:latest .

echo "📦 Applying K8s manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/minio.yaml

echo "⏳ Waiting for Postgres to be ready..."
kubectl -n velo wait --for=condition=ready pod -l app=postgres --timeout=120s

echo "⏳ Waiting for Redis to be ready..."
kubectl -n velo wait --for=condition=ready pod -l app=redis --timeout=60s

echo "⏳ Waiting for MinIO to be ready..."
kubectl -n velo wait --for=condition=ready pod -l app=minio --timeout=60s

echo "🚀 Deploying API..."
kubectl apply -f k8s/api.yaml

echo "⏳ Waiting for API pods..."
kubectl -n velo wait --for=condition=ready pod -l app=velo-api --timeout=120s

echo ""
echo "✅ All deployed! Check status:"
echo "   kubectl -n velo get pods"
echo "   kubectl -n velo get svc"
echo ""
echo "🌐 API available at: http://<VPS_IP>:30080"
echo "📦 MinIO Console at: http://<VPS_IP>:30901"
