import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[Redis] Connecting to: ${redisUrl}`);

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
        if (times > 5) {
            console.warn(`[Redis] Giving up after ${times} retries - Redis appears to be down`);
            console.warn(`[Redis] URL was: ${redisUrl}`);
            console.warn(`[Redis] Check in Headlamp: is the redis deployment running in namespace "velo"?`);
            console.warn(`[Redis] Check: kubectl -n velo get pods -l app=redis`);
            console.warn(`[Redis] Check: kubectl -n velo get svc redis-service`);
            return null;
        }
        const delay = Math.min(times * 1000, 5000);
        console.warn(`[Redis] Connection attempt ${times} failed, retrying in ${delay}ms...`);
        return delay;
    },
    reconnectOnError: () => false,
    lazyConnect: false,
    enableOfflineQueue: false,
});

let hasLoggedError = false;

redis.on("connect", () => {
    console.log("[Redis] ✅ Connected successfully");
    hasLoggedError = false;
});

redis.on("ready", () => {
    console.log("[Redis] ✅ Ready to accept commands");
});

redis.on("close", () => {
    if (!hasLoggedError) {
        console.warn("[Redis] Connection closed");
    }
});

redis.on("error", (err: Error) => {
    if (!hasLoggedError) {
        console.error(`[Redis] ❌ Error: ${err.message}`);
        hasLoggedError = true;
    }
});

redis.on("end", () => {
    console.warn("[Redis] Connection ended - will not reconnect");
});
