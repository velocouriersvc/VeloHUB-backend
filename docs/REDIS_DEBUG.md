# Redis Connection Debugging Guide

Run these commands **on your VPS** (`ssh emma24@velo-prod`) to diagnose why `velo-api` can't connect to Redis.

---

## 1. Check Redis pod is healthy

```bash
sudo kubectl -n velo get pods -l app=redis -o wide
```

## 2. Check Redis service exists

```bash
sudo kubectl -n velo get svc redis-service
```

## 3. Test Redis is responding inside its own pod

```bash
sudo kubectl -n velo exec deploy/redis -- redis-cli ping
```

Expected: `PONG`

## 4. Test network connectivity FROM the API pod TO Redis

```bash
sudo kubectl -n velo exec deploy/velo-api -- sh -c 'cat < /dev/tcp/redis-service/6379 & sleep 1 && kill $! 2>/dev/null && echo "CONNECTION OK" || echo "CONNECTION FAILED"'
```

If that doesn't work (some images lack `/dev/tcp`), try:

```bash
sudo kubectl -n velo exec deploy/velo-api -- sh -c 'wget --spider -T 2 redis-service:6379 2>&1'
```

## 5. Check what REDIS_URL the API pod actually sees

```bash
sudo kubectl -n velo exec deploy/velo-api -- env | grep -i redis
```

Expected: `REDIS_URL=redis://redis-service:6379`

If it says `redis://localhost:6379` or is missing, the ConfigMap isn't mounted properly.

## 6. Check the ConfigMap has the right value

```bash
sudo kubectl -n velo get configmap velo-config -o yaml | grep -i redis
```

Expected: `REDIS_URL: "redis://redis-service:6379"`

## 7. Check DNS resolution from the API pod

```bash
sudo kubectl -n velo exec deploy/velo-api -- sh -c 'nslookup redis-service 2>&1 || getent hosts redis-service 2>&1 || echo "DNS lookup tools not available"'
```

## 8. Check the API pod logs for our new Redis diagnostics

```bash
sudo kubectl -n velo logs deploy/velo-api --tail=50 | grep -i redis
```

This should now show:
- `[Redis] Connecting to: redis://...` — what URL it's using
- `[Redis] ✅ Connected` or `[Redis] ❌ Error: ...` — the result

## 9. Check if Redis requires a password (it shouldn't)

```bash
sudo kubectl -n velo exec deploy/redis -- redis-cli CONFIG GET requirepass
```

Expected: empty string (no password). If it shows a password, the `REDIS_URL` needs to include it: `redis://:PASSWORD@redis-service:6379`

---

## Quick Summary

| Step | Command | What it tells you |
|------|---------|-------------------|
| 3 | `exec deploy/redis -- redis-cli ping` | Redis itself works |
| 5 | `exec deploy/velo-api -- env \| grep redis` | API has correct URL |
| 4 | `exec deploy/velo-api -- wget ...` | Network path works |
| 8 | `logs deploy/velo-api \| grep redis` | What error the app sees |

**Most likely cause:** Step 5 will show the `REDIS_URL` is wrong or missing (ConfigMap not applied/reloaded after change).
