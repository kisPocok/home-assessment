// ABOUTME: Express application factory with pino-http request logging.
// ABOUTME: Exports createApp for testability and a default app instance for the server.

import express, { type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { createPinoHttpMiddleware } from "./logger";

function captureResponseBody(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    (res as Response & { body: unknown }).body = body;
    return originalJson(body);
  };
  next();
}

export function createApp(customLogger?: Logger) {
  const app = express();

  app.use(captureResponseBody);
  app.use(createPinoHttpMiddleware(customLogger));

  app.get("/healthcheck", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

export default createApp();
