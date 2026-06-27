
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

await redis.connect();

export async function get_key(key: string) {
  return redis.get(key);
}

export async function set_key(key: string, value: string | Record<string, unknown>, ttl: number = 60) {
  return redis.set(key, JSON.stringify(value), { EX: ttl });
}
