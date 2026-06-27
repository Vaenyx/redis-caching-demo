# Redis Caching Demo

A small Express + Redis demo project.

This project shows two common Redis use cases:

1. **HTTP response caching**
   A slow API route gets cached in Redis, so the second request is faster.

2. **Redis Streams as a queue**
   A welcome email job is added to a Redis Stream and processed by worker loops.

---

## Project Structure

```txt
.
├── docker-compose.yml
├── express/
│   ├── Dockerfile
│   ├── index.ts
│   ├── redis_helper.ts
│   ├── redis_middleware.ts
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── tsconfig.json
└── README.md
```

---

## Requirements

You need:

* Docker
* Docker Compose

You do not need to install Node.js, pnpm, or Redis on your host machine when using Docker.

---

## Starting the Project

From the project root, run:

```bash
docker compose up -d --build
```

This starts two services:

* `regex-api` / Express API
* `redis-server` / Redis database

Check if both containers are running:

```bash
docker compose ps
```

You should see both services with a running/up status.

---

## Testing Redis

Check if Redis is alive:

```bash
docker exec -it redis-server redis-cli ping
```

Expected output:

```txt
PONG
```

---

## Testing the Cached API Route

The test route is:

```txt
GET /get-iq/:name
```

Example:

```bash
curl -i http://localhost:3000/get-iq/vaenyx
```

Run it twice:

```bash
curl -i http://localhost:3000/get-iq/vaenyx
curl -i http://localhost:3000/get-iq/vaenyx
```

The first request should take around 2 seconds and return:

```txt
X-Cache: MISS
```

The second request should be faster and return:

```txt
X-Cache: HIT
```

Example response body:

```json
{
  "name": "vaenyx",
  "iq": 143
}
```

The cached response is stored for 60 seconds.

After 60 seconds, the cache expires and the next request becomes a cache miss again.

---

## How the Caching Works

The route:

```ts
app.get("/get-iq/:name", cache(60), async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  res.send({
    name: req.params.name,
    iq: Math.ceil(Math.random() * 100 + 50),
  });
});
```

uses the custom `cache(60)` middleware.

The number `60` is the TTL in seconds.

When a request comes in, the middleware creates a cache key from the request data:

* HTTP method
* route params
* query params
* request body
* original URL

It hashes that data using SHA-256 and creates a Redis key like:

```txt
cache:<hash>
```

### Cache Miss

If Redis does not contain a value for that key:

1. The middleware marks the response as a cache miss.
2. The normal route handler runs.
3. The response gets stored in Redis.
4. The client receives the response with:

```txt
X-Cache: MISS
```

### Cache Hit

If Redis already contains a value for that key:

1. The route handler is skipped.
2. The cached status, headers, and body are restored.
3. The client receives the response with:

```txt
X-Cache: HIT
```

The response also includes an `Age` header showing how old the cached value is.

---

## Inspecting Redis Data

List keys:

```bash
docker exec -it redis-server redis-cli KEYS '*'
```

Better for real usage:

```bash
docker exec -it redis-server redis-cli SCAN 0
```

Check stream entries:

```bash
docker exec -it redis-server redis-cli XRANGE email-jobs - +
```

Check pending stream messages:

```bash
docker exec -it redis-server redis-cli XPENDING email-jobs email-workers
```

---

## Useful Docker Commands

Start the project:

```bash
docker compose up -d --build
```

Stop the project:

```bash
docker compose down
```

Stop and remove Redis data too:

```bash
docker compose down -v
```

View API logs:

```bash
docker logs -f regex-api
```

View Redis logs:

```bash
docker logs -f redis-server
```

Rebuild without cache:

```bash
docker compose --progress=plain build --no-cache
docker compose up -d
```

---

## How the Middleware Works

The caching logic is implemented as reusable Express middleware.

Instead of writing Redis caching logic directly into every route, the route can simply use:

```ts
app.get("/get-iq/:name", cache(60), async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  res.send({
    name: req.params.name,
    iq: Math.ceil(Math.random() * 100 + 50),
  });
});
```

The `cache(60)` part means:

```txt
Cache this route response for 60 seconds.
```

---

### What Middleware Is

Middleware is code that runs between the incoming request and the final route handler.

For this route:

```ts
app.get("/get-iq/:name", cache(60), handler);
```

the order is:

```txt
Request
  ↓
cache(60) middleware
  ↓
Route handler
  ↓
Response
```

The middleware can decide whether the request should continue to the route handler or whether it should return a cached response immediately.

---

### Step 1: Create a Cache Key

When a request comes in, the middleware creates a cache key from the request data.

It uses values like:

* HTTP method
* route params
* query params
* request body
* original URL

Example request:

```txt
GET /get-iq/vaenyx
```

The middleware turns the request information into a JSON object and hashes it using SHA-256.

This creates a Redis key like:

```txt
cache:abc123...
```

The reason for hashing is that Redis keys should be short, consistent, and safe to store.

---

### Step 2: Check Redis

The middleware checks if Redis already has a cached response for this key.

Simplified logic:

```ts
const cached = await redis.get(cacheKey);
```

If Redis returns a value, the request is a **cache hit**.

If Redis returns nothing, the request is a **cache miss**.

---

### Step 3: Cache Hit

On a cache hit, the middleware does not call the real route handler.

That means this slow code does not run again:

```ts
await new Promise((resolve) => setTimeout(resolve, 2000));
```

Instead, the middleware restores the saved response from Redis and sends it back directly.

The response includes:

```txt
X-Cache: HIT
```

It also includes an `Age` header, which shows how old the cached response is.

Example:

```txt
X-Cache: HIT
Age: 12
```

This means the response came from Redis and was cached 12 seconds ago.

---

### Step 4: Cache Miss

On a cache miss, the middleware allows the request to continue.

It does this by calling:

```ts
next();
```

Then the normal route handler runs.

For example:

```ts
res.send({
  name: req.params.name,
  iq: Math.ceil(Math.random() * 100 + 50),
});
```

Before the response is sent to the client, the middleware captures it and stores it in Redis.

It stores data like:

* response status
* response headers
* response body
* creation time

The response is stored with a TTL:

```txt
60 seconds
```

After that time, Redis automatically deletes the cached value.

The response includes:

```txt
X-Cache: MISS
```

---

### Why `res.send` Is Overwritten

The middleware needs to cache the final response body.

Express normally sends the response through:

```ts
res.send(...)
```

So the middleware temporarily wraps or overwrites `res.send`.

That allows it to inspect the response before it leaves the server.

The simplified idea looks like this:

```ts
const originalSend = res.send;

res.send = function (body) {
  // save response in Redis here

  return originalSend.call(this, body);
};
```

So the route handler still uses `res.send(...)` normally, but the middleware gets a chance to store the response first.

---

### Why This Is Useful

Without caching:

```txt
Request 1 → slow route → 2 seconds
Request 2 → slow route → 2 seconds
Request 3 → slow route → 2 seconds
```

With Redis caching:

```txt
Request 1 → slow route → cache result → 2 seconds
Request 2 → Redis cache hit → instant
Request 3 → Redis cache hit → instant
```

This is useful when a route does expensive work, for example:

* calling another API
* reading from a database
* calculating a result
* generating a report
* waiting for slow external services

---

### Important Detail

The cache key includes request-specific data.

That means these requests get different cache entries:

```txt
/get-iq/vaenyx
/get-iq/notch
/get-iq/steve
```

So the cached result for one name does not overwrite the cached result for another name.

