// ABOUTME: Tests for the Express app - healthcheck endpoint and pino-http logging.
// ABOUTME: Uses supertest to make HTTP assertions without starting the server.

import { describe, expect, test } from "bun:test";
import { Writable } from "stream";
import pino from "pino";
import request from "supertest";
import { createApp } from "./app";

const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });
const silentLogger = pino(devNull);

describe("GET /healthcheck", () => {
  test("returns 200 with { status: 'ok' }", async () => {
    const app = createApp(silentLogger);
    const response = await request(app).get("/healthcheck");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("pino-http middleware", () => {
  function createCapturingApp() {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(stream);
    const app = createApp(logger);
    return { app, chunks };
  }

  async function flushLogs() {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  test("req contains only method and url", async () => {
    const { app, chunks } = createCapturingApp();

    await request(app).get("/healthcheck");
    await flushLogs();

    expect(chunks.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(chunks[0]!);
    const reqKeys = Object.keys(logEntry.req).sort();
    expect(reqKeys).toEqual(["method", "url"]);
  });

  test("res contains only statusCode and body", async () => {
    const { app, chunks } = createCapturingApp();

    await request(app).get("/healthcheck");
    await flushLogs();

    expect(chunks.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(chunks[0]!);
    const resKeys = Object.keys(logEntry.res).sort();
    expect(resKeys).toEqual(["body", "statusCode"]);
    expect(logEntry.res.statusCode).toBe(200);
    expect(logEntry.res.body).toEqual({ status: "ok" });
  });
});
