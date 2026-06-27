import express from "express";
import type { Request, Response } from "express";

import { cache } from "./redis_middleware.js";

const app = express();
app.use(express.json());

app.get("/get-iq/:name", cache(60), async (req: Request, res: Response) => {
  // simulate it taking a long time
  await new Promise((resolve) =>
    setTimeout(resolve, 2000)
  );

  res.send({ name: req.params.name, iq: Math.ceil(Math.random() * 100 + 50) });
});

app.listen(3000);
