// ABOUTME: Project-wide pino logger instance.
// ABOUTME: Uses pino-pretty transport in non-production environments.

import type { IncomingMessage, ServerResponse } from "http";
import type { Logger } from "pino";
import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});

export function createPinoHttpMiddleware(customLogger?: Logger) {
  return pinoHttp({
    logger: customLogger ?? logger,
    // serializers: {
    //   req(req: IncomingMessage) {
    //     return {
    //       method: req.method,
    //       url: req.url,
    //       // query: (req as typeof req & { query?: unknown }).query,
    //       // params: (req as typeof req & { params?: unknown }).params,
    //       // headers: req.headers,
    //     };
    //   },
    //   res(res: ServerResponse) {
    //     const raw = (res as unknown as { raw: { body?: unknown } }).raw;
    //     return {
    //       statusCode: res.statusCode,
    //       body: raw.body,
    //     };
    //   },
    // },
  });
}

export default logger;
