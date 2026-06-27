
import { createClient } from "redis";

const redis = createClient();
await redis.connect();

try {
  await redis.xGroupCreate(
    "email-jobs",
    "email-workers",
    "$",
    { MKSTREAM: true }
  );
} catch (err: any) {
  if (!err.message.includes("BUSYGROUP")) {
    throw err;
  }
}

export async function ack_email(id: string) {
  let test = await redis.xAck("email-jobs", "email-workers", id)
  return !!test;
}

export async function add_welcome_email(userId: number, email: string) {
  let email_add = await redis.xAdd("email-jobs", "*", {
    event: "welcome_email",
    userId: userId.toString(),
    email,
  });

  return !!email_add;
}

async function get_unclaimed_email(name: string) {
  const result: any = await redis.xAutoClaim(
    "email-jobs",
    "email-workers",
    name,
    60000,
    "0-0",
    {
      COUNT: 1,
    }
  );

  if (!result || !result.messages[0]) {
    return null;
  }

  return result.messages[0];
}

async function get_untouched_email(name: string) {
  const result = await redis.xReadGroup(

    "email-workers",
    name,
    [{ key: "email-jobs", id: ">" }],
    {
      COUNT: 1,
    }
  );

  if (!result || !result[0].messages[0]) {
    return null;
  }

  return result[0].messages[0];


}

export async function get_email(name: string) {
  return await get_unclaimed_email(name) || await get_untouched_email(name) || null;
}

export async function get_key(key: string) {
  return redis.get(key);
}

export async function set_key(key: string, value: string | Record<string, unknown>, ttl: number = 60) {
  return redis.set(key, JSON.stringify(value), { EX: ttl });
}
