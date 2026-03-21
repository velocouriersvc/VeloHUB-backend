# 📊 VeloHub API — Monitoring & Observability Setup

Complete guide for setting up **Prometheus**, **Grafana**, and **Loki** to monitor the VeloHub API on your K3s/Kubernetes cluster.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Prometheus Setup](#prometheus-setup)
4. [Grafana Setup](#grafana-setup)
5. [Loki Setup (Log Aggregation)](#loki-setup-log-aggregation)
6. [Grafana Dashboards](#grafana-dashboards)
7. [Alert Rules](#alert-rules)
8. [Nginx Proxy for Grafana UI](#nginx-proxy-for-grafana-ui)
9. [Quick Commands Reference](#quick-commands-reference)

---

## Architecture Overview

```
┌──────────────┐      scrape /metrics       ┌──────────────┐
│  VeloHub API │ ◄──────────────────────── │  Prometheus  │
│  (Port 3000) │                            │  (Port 9090) │
└──────────────┘                            └──────┬───────┘
                                                   │ data source
┌──────────────┐      push logs             ┌──────▼───────┐
│  Promtail    │ ──────────────────────────► │   Grafana    │
│  (DaemonSet) │                            │  (Port 3001) │
└──────────────┘                            └──────┬───────┘
                                                   │ data source
                                            ┌──────▼───────┐
                                            │    Loki      │
                                            │  (Port 3100) │
                                            └──────────────┘
```

- **Prometheus** — Scrapes `/metrics` from the API, stores time-series data
- **Grafana** — Dashboards & alerting UI
- **Loki + Promtail** — Collects container logs (replaces ELK stack, much lighter)

---

## Prerequisites

- K3s running on your VPS (`kubectl` working)
- VeloHub API deployed with the `/metrics` endpoint exposed (already done)
- SSH access to your VPS

```bash
ssh emma24@38.242.149.20
```

Verify the metrics endpoint works:
```bash
curl http://localhost:30080/metrics
```

You should see Prometheus-format metrics like `http_requests_total`, `http_request_duration_seconds`, etc.

---

## Prometheus Setup

### 1. Create the monitoring namespace

```bash
kubectl create namespace monitoring
```

### 2. Create Prometheus ConfigMap

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s

    scrape_configs:
      - job_name: 'velo-api'
        metrics_path: '/metrics'
        static_configs:
          - targets: ['velo-api-service.velo.svc.cluster.local:3000']
            labels:
              app: 'velo-api'
              environment: 'production'

      - job_name: 'prometheus'
        static_configs:
          - targets: ['localhost:9090']

      - job_name: 'node-exporter'
        static_configs:
          - targets: ['node-exporter.monitoring.svc.cluster.local:9100']
EOF
```

### 3. Create Prometheus PersistentVolumeClaim

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-data
  namespace: monitoring
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
EOF
```

### 4. Deploy Prometheus

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
  labels:
    app: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
        - name: prometheus
          image: prom/prometheus:v2.53.0
          args:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus'
            - '--storage.tsdb.retention.time=30d'
            - '--web.enable-lifecycle'
          ports:
            - containerPort: 9090
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
            - name: data
              mountPath: /prometheus
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: config
          configMap:
            name: prometheus-config
        - name: data
          persistentVolumeClaim:
            claimName: prometheus-data
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: monitoring
spec:
  selector:
    app: prometheus
  ports:
    - port: 9090
      targetPort: 9090
  type: ClusterIP
EOF
```

### 5. Deploy Node Exporter (system metrics — CPU, RAM, disk)

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      containers:
        - name: node-exporter
          image: prom/node-exporter:v1.8.1
          ports:
            - containerPort: 9100
          args:
            - '--path.rootfs=/host'
          volumeMounts:
            - name: rootfs
              mountPath: /host
              readOnly: true
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 100m
              memory: 128Mi
      volumes:
        - name: rootfs
          hostPath:
            path: /
---
apiVersion: v1
kind: Service
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    app: node-exporter
  ports:
    - port: 9100
      targetPort: 9100
  type: ClusterIP
EOF
```

---

## Grafana Setup

### 1. Create Grafana PersistentVolumeClaim

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: grafana-data
  namespace: monitoring
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
EOF
```

### 2. Create Grafana Datasource ConfigMap

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: monitoring
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
      - name: Prometheus
        type: prometheus
        access: proxy
        url: http://prometheus.monitoring.svc.cluster.local:9090
        isDefault: true
        editable: false

      - name: Loki
        type: loki
        access: proxy
        url: http://loki.monitoring.svc.cluster.local:3100
        editable: false
EOF
```

### 3. Deploy Grafana

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
  labels:
    app: grafana
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      securityContext:
        runAsUser: 472
        fsGroup: 472
      containers:
        - name: grafana
          image: grafana/grafana:11.1.0
          ports:
            - containerPort: 3000
          env:
            - name: GF_SECURITY_ADMIN_USER
              value: "admin"
            - name: GF_SECURITY_ADMIN_PASSWORD
              value: "VeloAdmin2024!"
            - name: GF_SERVER_ROOT_URL
              value: "https://monitoring.velocouriersvc.com"
            - name: GF_SERVER_HTTP_PORT
              value: "3000"
          volumeMounts:
            - name: data
              mountPath: /var/lib/grafana
            - name: datasources
              mountPath: /etc/grafana/provisioning/datasources
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 300m
              memory: 256Mi
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: grafana-data
        - name: datasources
          configMap:
            name: grafana-datasources
---
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: monitoring
spec:
  selector:
    app: grafana
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30300
  type: NodePort
EOF
```

> ⚠️ **Change the admin password** immediately after first login! The default is `VeloAdmin2024!`.

---

## Loki Setup (Log Aggregation)

Loki collects all your container logs so you can search and view them in Grafana — much lighter than ELK.

### 1. Deploy Loki

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loki
  namespace: monitoring
  labels:
    app: loki
spec:
  replicas: 1
  selector:
    matchLabels:
      app: loki
  template:
    metadata:
      labels:
        app: loki
    spec:
      containers:
        - name: loki
          image: grafana/loki:3.1.0
          args:
            - '-config.file=/etc/loki/local-config.yaml'
          ports:
            - containerPort: 3100
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 300m
              memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: loki
  namespace: monitoring
spec:
  selector:
    app: loki
  ports:
    - port: 3100
      targetPort: 3100
  type: ClusterIP
EOF
```

### 2. Deploy Promtail (log collector)

Promtail runs on every node and ships container logs to Loki.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: monitoring
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
    positions:
      filename: /tmp/positions.yaml
    clients:
      - url: http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/push
    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container
          - source_labels: [__meta_kubernetes_pod_label_app]
            target_label: app
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: monitoring
  labels:
    app: promtail
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      serviceAccountName: promtail
      containers:
        - name: promtail
          image: grafana/promtail:3.1.0
          args:
            - '-config.file=/etc/promtail/promtail.yaml'
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: containers
              mountPath: /var/lib/docker/containers
              readOnly: true
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 100m
              memory: 128Mi
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: varlog
          hostPath:
            path: /var/log
        - name: containers
          hostPath:
            path: /var/lib/docker/containers
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: promtail
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: promtail
rules:
  - apiGroups: [""]
    resources: ["pods", "nodes"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: promtail
subjects:
  - kind: ServiceAccount
    name: promtail
    namespace: monitoring
roleRef:
  kind: ClusterRole
  name: promtail
  apiGroup: rbac.authorization.k8s.io
EOF
```

---

## Grafana Dashboards

After deploying, access Grafana and import these dashboards.

### Access Grafana

```
https://monitoring.velocouriersvc.com
# or directly: http://38.242.149.20:30300
```

Login: `admin` / `VeloAdmin2024!`

### Import the VeloHub API Dashboard

Go to **Dashboards → New → Import** and paste this JSON:

```json
{
  "dashboard": {
    "title": "VeloHub API Dashboard",
    "uid": "velo-api-main",
    "panels": [
      {
        "title": "Request Rate (req/s)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
        "targets": [{
          "expr": "rate(http_requests_total{app=\"velo-api\"}[5m])",
          "legendFormat": "{{method}} {{route}} {{status_code}}"
        }]
      },
      {
        "title": "Response Time (p95)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app=\"velo-api\"}[5m]))",
          "legendFormat": "p95 {{method}} {{route}}"
        }]
      },
      {
        "title": "Error Rate (%)",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 0, "y": 8 },
        "targets": [{
          "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) * 100",
          "legendFormat": "Error %"
        }]
      },
      {
        "title": "Active Requests",
        "type": "gauge",
        "gridPos": { "h": 4, "w": 6, "x": 6, "y": 8 },
        "targets": [{
          "expr": "active_requests",
          "legendFormat": "Active"
        }]
      },
      {
        "title": "Ride Requests",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [{
          "expr": "rate(ride_requests_total[5m])",
          "legendFormat": "{{vehicle_type}} - {{status}}"
        }]
      },
      {
        "title": "Payments Processed",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [{
          "expr": "rate(payments_processed_total[5m])",
          "legendFormat": "{{method}} - {{status}}"
        }]
      },
      {
        "title": "CPU Usage",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 20 },
        "targets": [{
          "expr": "process_cpu_seconds_total{app=\"velo-api\"}",
          "legendFormat": "CPU"
        }]
      },
      {
        "title": "Memory Usage (MB)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 20 },
        "targets": [{
          "expr": "process_resident_memory_bytes{app=\"velo-api\"} / 1024 / 1024",
          "legendFormat": "RSS (MB)"
        }]
      }
    ],
    "time": { "from": "now-1h", "to": "now" },
    "refresh": "10s"
  }
}
```

### Recommended Community Dashboards to Import

Go to **Dashboards → Import** and use these Dashboard IDs:

| Dashboard | ID | Description |
|---|---|---|
| Node Exporter Full | `1860` | Full server metrics (CPU, RAM, disk, network) |
| Kubernetes Cluster | `6417` | K8s cluster overview |
| Container Metrics | `14282` | Per-container CPU/memory/network |

---

## Alert Rules

### Create Prometheus Alert Rules

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts
  namespace: monitoring
data:
  alerts.yml: |
    groups:
      - name: velo-api-alerts
        rules:
          # High error rate — more than 5% of requests returning 5xx
          - alert: HighErrorRate
            expr: |
              sum(rate(http_requests_total{status_code=~"5.."}[5m]))
              / sum(rate(http_requests_total[5m])) > 0.05
            for: 5m
            labels:
              severity: critical
            annotations:
              summary: "High error rate on VeloHub API"
              description: "More than 5% of requests are returning 5xx errors for the last 5 minutes."

          # Slow responses — p95 latency above 2 seconds
          - alert: SlowResponses
            expr: |
              histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
            for: 5m
            labels:
              severity: warning
            annotations:
              summary: "Slow API responses"
              description: "95th percentile response time is above 2 seconds."

          # API is down — no requests received for 2 minutes
          - alert: APIDown
            expr: |
              up{job="velo-api"} == 0
            for: 2m
            labels:
              severity: critical
            annotations:
              summary: "VeloHub API is down"
              description: "Prometheus cannot reach the VeloHub API metrics endpoint."

          # High memory usage — over 512MB
          - alert: HighMemoryUsage
            expr: |
              process_resident_memory_bytes{job="velo-api"} > 536870912
            for: 5m
            labels:
              severity: warning
            annotations:
              summary: "High memory usage"
              description: "VeloHub API is using more than 512MB of memory."

          # Server disk almost full — over 85%
          - alert: DiskAlmostFull
            expr: |
              (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 > 85
            for: 10m
            labels:
              severity: warning
            annotations:
              summary: "Disk space is running low"
              description: "Root filesystem is more than 85% full."

          # High CPU — over 80% for 10 minutes
          - alert: HighCPU
            expr: |
              100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
            for: 10m
            labels:
              severity: warning
            annotations:
              summary: "High CPU usage on server"
              description: "Server CPU usage is above 80% for the last 10 minutes."
EOF
```

Then update the Prometheus config to load alerts:

```bash
kubectl edit configmap prometheus-config -n monitoring
```

Add this under the `prometheus.yml` data, after `global:`:

```yaml
    rule_files:
      - /etc/prometheus/alerts.yml
```

And mount the alerts config in the Prometheus deployment volume:

```bash
kubectl edit deployment prometheus -n monitoring
```

Add another volume and volumeMount for the alerts configmap (or merge both configmaps into one).

### (Optional) Grafana Alerting via Telegram/Email

In Grafana UI:
1. Go to **Alerting → Contact points**
2. Add Telegram bot: paste your bot token and chat ID
3. Create alert rules that fire notifications to the contact point

---

## Nginx Proxy for Grafana UI

Set up `monitoring.velocouriersvc.com` to point to Grafana.

### 1. Add DNS Record

Add an **A record** in your domain registrar:
```
monitoring.velocouriersvc.com → 38.242.149.20
```

### 2. Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/monitoring
```

Paste:

```nginx
server {
    listen 80;
    server_name monitoring.velocouriersvc.com;

    location / {
        proxy_pass http://127.0.0.1:30300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (Grafana live)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable & test:

```bash
sudo ln -s /etc/nginx/sites-available/monitoring /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Add SSL with Certbot

```bash
sudo certbot --nginx -d monitoring.velocouriersvc.com
```

---

## Quick Commands Reference

### Check Everything is Running

```bash
kubectl get all -n monitoring
```

### View Prometheus Targets

```
http://38.242.149.20:30300  →  Grafana
```
Or port-forward Prometheus locally:
```bash
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
# Then open http://localhost:9090/targets
```

### View API Metrics Directly

```bash
curl http://38.242.149.20:30080/metrics
```

### Restart Prometheus After Config Change

```bash
kubectl rollout restart deployment prometheus -n monitoring
```

### View Loki Logs in Grafana

1. Open Grafana → **Explore**
2. Select **Loki** datasource
3. Query: `{app="velo-api"}` to see all API logs
4. Filter: `{app="velo-api"} |= "error"` for error logs only

### Common Prometheus Queries (PromQL)

```promql
# Total requests in last hour
sum(increase(http_requests_total[1h]))

# Request rate per second
rate(http_requests_total[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# Rides created in last hour
sum(increase(ride_requests_total{status="created"}[1h]))

# Successful payments in last hour
sum(increase(payments_processed_total{status="success"}[1h]))

# Memory usage in MB
process_resident_memory_bytes / 1024 / 1024

# Event loop lag
nodejs_eventloop_lag_seconds
```

### Deploy All at Once (one-liner)

```bash
kubectl create namespace monitoring 2>/dev/null; \
kubectl apply -f prometheus-config.yaml -f prometheus.yaml -f node-exporter.yaml \
  -f grafana-datasources.yaml -f grafana.yaml \
  -f loki.yaml -f promtail.yaml \
  -f prometheus-alerts.yaml -n monitoring
```

> 💡 **Tip**: Save each manifest above as a separate YAML file, or combine them into a single `monitoring-stack.yaml`.

---

## Summary

| Component | Port | Access |
|---|---|---|
| VeloHub API `/metrics` | `30080` | `http://38.242.149.20:30080/metrics` |
| Prometheus | `9090` | Internal (ClusterIP) — port-forward to access |
| Grafana | `30300` | `https://monitoring.velocouriersvc.com` |
| Loki | `3100` | Internal (ClusterIP) — queried via Grafana |
| Node Exporter | `9100` | Internal (ClusterIP) — scraped by Prometheus |

**Stack**: Prometheus + Grafana + Loki + Promtail + Node Exporter — the industry-standard open-source monitoring stack. 🚀
