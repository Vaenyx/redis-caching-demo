import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { get_key, set_key } from "./redis_helper.ts";

export function cache(ttl: number) {

  function overwrite_send(res: Response, key: string) {
    const original_send = res.send;

    res.send = function(body) {
      res.setHeader("X-Cache", "MISS");
      set_key(key, { status: res.statusCode, headers: res.getHeaders(), body: body, cachedAt: Date.now() }, ttl);
      return original_send.call(this, body);
    };
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const relevant = JSON.stringify({ method: req.method, params: req.params, query: req.query, body: req.body, url: req.originalUrl });
    const key = `cache:${crypto.createHash("sha256").update(relevant).digest("hex")}`
    let cached_value = await get_key(key);

    if (!cached_value) {
      console.log("cache miss");
      overwrite_send(res, key);
      next();
      return;
    }

    cached_value = JSON.parse(cached_value);
    console.log("cache hit");

    res.set(cached_value?.headers);
    res.setHeader("X-Cache", "HIT")
    res.setHeader("Age", Math.floor((Date.now() - cached_value?.cachedAt) / 1000));
    res.statusCode = cached_value?.status;
    res.send(cached_value?.body);
  }
}
