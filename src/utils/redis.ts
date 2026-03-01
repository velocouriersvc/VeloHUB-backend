import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
        const delay = Math.min(times * 200, 2000);
        return delay;
    },
});

redis.on("connect", () => {
    console.log("✅ Redis connected");
});

redis.on("error", (err: Error) => {
    console.error("❌ Redis connection error:", err.message);
});
