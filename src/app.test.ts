// ABOUTME: Tests for the Express app - healthcheck endpoint.
// ABOUTME: Uses supertest to make HTTP assertions without starting the server.

import { describe, expect, test } from "bun:test";
import request from "supertest";
import { createApp } from "./app";

describe("GET /healthcheck", () => {
  test("returns 200 with { status: 'ok' }", async () => {
    const app = createApp(undefined, []);
    const response = await request(app).get("/healthcheck");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("POST /jobs", () => {
  test("creates a job and returns it with id", async () => {
    const app = createApp(undefined, []);
    const response = await request(app)
      .post("/jobs")
      .send({ name: "test-job" });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("id");
    expect(response.body.name).toBe("test-job");
    expect(response.body.status).toBe("pending");
  });
});

describe("GET /jobs", () => {
  test("returns list of all jobs", async () => {
    const jobs: { id: string; name: string; type: "http"; status: "pending" | "running" | "completed" | "failed"; createdAt: Date }[] = [];
    const app = createApp(undefined, jobs);

    // Create a job first
    await request(app).post("/jobs").send({ name: "job-1" });
    await request(app).post("/jobs").send({ name: "job-2" });

    // List all jobs
    const response = await request(app).get("/jobs");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].name).toBe("job-1");
    expect(response.body[0].status).toBe("pending");
    expect(response.body[1].name).toBe("job-2");
    expect(response.body[1].status).toBe("pending");
  });
});
