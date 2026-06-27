import express from "express";
import type { Request, Response } from "express";

import * as redis_helper from "./redis_helper.ts";
import { cache } from "./redis_middleware.js";

const app = express();
app.use(express.json());

async function send_mail(userId: number, email: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, 2000)
  );

  console.log(`Sent mail to '${email}' ('${userId}')`);
}

async function handle_mail(worker: string, message: { id: string, message: { userId: number, email: string } }) {
  await send_mail(message.message.userId, message.message.email);
  await redis_helper.ack_email(message.id)
  console.log(
    `${worker} acknowledged ${message.id}`
  );
}

async function worker(name: string) {
  while (true) {
    let message = await redis_helper.get_email(name);
    if (!message) { continue; }
    await handle_mail(name, message);
  }
}

app.post("/send-welcome-mail", async (req: Request, res: Response) => {
  const { userId, email }: { userId: number; email: string } = req.body;

  let gotQueued = await redis_helper.add_welcome_email(userId, email);

  res.send({ queued: gotQueued });
});

app.get("/get-iq/:name", cache(60), async (req: Request, res: Response) => {
  await new Promise((resolve) =>
    setTimeout(resolve, 2000)
  );

  res.send({ name: req.params.name, iq: Math.ceil(Math.random() * 100 + 50) });
});

worker("worker1");
worker("worker2");
worker("worker3");

app.listen(3000);
