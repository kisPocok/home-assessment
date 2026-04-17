// ABOUTME: Express application factory with pino-http request logging.
// ABOUTME: Exports createApp for testability and a default app instance for the server.

import express, { type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { createPinoHttpMiddleware } from "./logger";

export type JobType = "http" | "browser";

export type Job = {
  id: string;
  name: string;
  type: JobType;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
};

function captureResponseBody(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    (res as Response & { body: unknown }).body = body;
    return originalJson(body);
  };
  next();
}

export function createApp(customLogger?: Logger, jobs: Job[] = []) {
  const app = express();

  app.use(express.json());
  app.use(captureResponseBody);
  // app.use(createPinoHttpMiddleware(customLogger));

  app.get("/healthcheck", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/jobs", (req, res) => {
    const jobType: JobType = req.body.type === "browser" ? "browser" : "http";
    const job: Job = {
      id: crypto.randomUUID(),
      name: req.body.name,
      type: jobType,
      status: "pending",
      createdAt: new Date(),
    };
    jobs.push(job);
    customLogger?.info({ job }, "Job created");
    res.status(201).json(job);
  });

  app.get("/jobs", (_req, res) => {
    customLogger?.info({ jobs }, "Jobs listed");
    res.json(jobs);
  });

  return app;
}

export default createApp();
