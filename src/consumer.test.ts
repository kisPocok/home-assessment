// ABOUTME: Tests for the jobs queue consumer - verifies polling and job processing.
// ABOUTME: Tests use actual async delays since Bun doesn't support fake timers like Jest.

import { describe, expect, test, mock } from "bun:test";
import { createConsumer } from "./consumer";
import type { Job } from "./app";
import type { DockerClient, ContainerInfo } from "./docker";
import { Writable } from "stream";
import pino from "pino";

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});
const silentLogger = pino(devNull);

function createMockDockerClient(
  httpRunFn?: () => Promise<ContainerInfo>,
  browserRunFn?: () => Promise<ContainerInfo>
): DockerClient {
  return {
    runHttpServer: mock(httpRunFn ?? (() => Promise.resolve({
      id: "mock-container-id",
      url: "http://localhost:8080",
      name: "mock-job",
    }))),
    runBrowser: mock(browserRunFn ?? (() => Promise.resolve({
      id: "mock-browser-id",
      url: "http://localhost:9222",
      cdpUrl: "ws://localhost:9222",
      name: "mock-browser-job",
    }))),
    inspectContainer: mock(() => Promise.resolve({
      id: "mock-container-id",
      state: { status: "running", running: true },
    })),
  };
}

describe("Consumer", () => {
  test("processes next job from queue and removes it", async () => {
    const jobs: Job[] = [];
    const job: Job = {
      id: "1",
      name: "test-job",
      type: "http",
      status: "pending",
      createdAt: new Date(),
    };
    jobs.push(job);

    const docker = createMockDockerClient();
    const consumer = createConsumer(jobs, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(jobs).toHaveLength(0);
    expect(docker.runHttpServer).toHaveBeenCalled();
    consumer.stop();
  });

  test("polls every 5 seconds", async () => {
    const jobs: Job[] = [
      { id: "1", name: "job-1", type: "http", status: "pending", createdAt: new Date() },
      { id: "2", name: "job-2", type: "http", status: "pending", createdAt: new Date() },
    ];

    const docker = createMockDockerClient();
    const consumer = createConsumer(jobs, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("2");

    await new Promise<void>((resolve) => setTimeout(resolve, 5100));
    expect(jobs).toHaveLength(0);

    consumer.stop();
  }, 15000);

  test("does nothing when queue is empty", async () => {
    const jobs: Job[] = [];
    const docker = createMockDockerClient();
    const consumer = createConsumer(jobs, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(jobs).toHaveLength(0);
    expect(docker.runHttpServer).not.toHaveBeenCalled();

    consumer.stop();
  });

  test("stops polling when stop is called", async () => {
    const jobs: Job[] = [
      { id: "1", name: "job-1", type: "http", status: "pending", createdAt: new Date() },
      { id: "2", name: "job-2", type: "http", status: "pending", createdAt: new Date() },
    ];

    const docker = createMockDockerClient();
    const consumer = createConsumer(jobs, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(jobs).toHaveLength(1);

    consumer.stop();

    await new Promise<void>((resolve) => setTimeout(resolve, 5200));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("2");
  }, 10000);

  test("logs container URL when processing a job", async () => {
    const jobs: Job[] = [];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(stream);

    jobs.push({ id: "1", name: "test-job", type: "http", status: "pending", createdAt: new Date() });

    const docker = createMockDockerClient(() => Promise.resolve({
      id: "container-123",
      url: "http://localhost:3001",
      name: "test-job",
    }));
    const consumer = createConsumer(jobs, capturingLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(chunks.length).toBeGreaterThan(0);
    const logs = chunks.map((c: string) => JSON.parse(c) as { msg?: string; container?: { url?: string }; jobId?: string });
    const urlLog = logs.find((l) => l.container?.url === "http://localhost:3001");
    expect(urlLog).toBeDefined();
    expect(urlLog?.jobId).toBe("1");

    consumer.stop();
  });

  test("handles container errors gracefully", async () => {
    const jobs: Job[] = [];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(stream);

    const failingDocker = createMockDockerClient(() => {
      return Promise.reject(new Error("Port already in use"));
    });

    jobs.push({ id: "1", name: "test-job", type: "http", status: "pending", createdAt: new Date() });

    const consumer = createConsumer(jobs, capturingLogger, failingDocker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(jobs).toHaveLength(0);

    const logs = chunks.map((c: string) => JSON.parse(c) as { msg?: string });
    const errorLog = logs.find((l) => l.msg?.includes("Job failed"));
    expect(errorLog).toBeDefined();

    consumer.stop();
  });
});
