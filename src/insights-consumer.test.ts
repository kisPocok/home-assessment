// ABOUTME: Tests for insights consumer - verifies container polling and logging.

import { describe, expect, test, mock } from "bun:test";
import { createInsightsConsumer } from "./insights-consumer";
import type { RunningContainer } from "./consumer";
import type { DockerClient } from "./docker";
import { Writable } from "stream";
import pino from "pino";

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});
const silentLogger = pino(devNull);

function createMockDockerClient(inspectFn?: () => Promise<{ id: string; state: { status: string; running: boolean } }>): DockerClient {
  return {
    runHttpServer: mock(() => Promise.resolve({ id: "mock", url: "http://localhost:8080", name: "mock" })),
    runBrowser: mock(() => Promise.resolve({ id: "mock", url: "http://localhost:9222", cdpUrl: "ws://localhost:9222", name: "mock" })),
    inspectContainer: mock(inspectFn ?? (() => Promise.resolve({
      id: "container-123",
      state: { status: "running", running: true },
    }))),
    reapLeftoverContainers: mock(() => Promise.resolve()),
  };
}

describe("InsightsConsumer", () => {
  test("polls containers and logs status", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "job-1", containerId: "container-1", name: "test-job", type: "http" },
    ];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(stream);

    const docker = createMockDockerClient(() => Promise.resolve({
      id: "container-1",
      state: { status: "running", running: true },
    }));

    const consumer = createInsightsConsumer(runningContainers, capturingLogger, docker, 100);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const logs = chunks.map((c: string) => JSON.parse(c) as { msg?: string; status?: string; jobId?: string });
    const statusLog = logs.find((l) => l.status === "running");
    expect(statusLog).toBeDefined();
    expect(statusLog?.jobId).toBe("job-1");

    consumer.stop();
  });

  test("does nothing when no running containers", async () => {
    const runningContainers: RunningContainer[] = [];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(stream);

    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, capturingLogger, docker, 100);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(docker.inspectContainer).not.toHaveBeenCalled();

    consumer.stop();
  });

  test("logs error when inspect fails", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "job-1", containerId: "container-1", name: "test-job", type: "http" },
    ];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(stream);

    const docker = createMockDockerClient(() => {
      return Promise.reject(new Error("Container not found"));
    });

    const consumer = createInsightsConsumer(runningContainers, capturingLogger, docker, 100);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const logs = chunks.map((c: string) => JSON.parse(c) as { msg?: string; err?: { message: string } });
    const errorLog = logs.find((l) => l.msg?.includes("Failed to inspect container"));
    expect(errorLog).toBeDefined();

    consumer.stop();
  });

  test("stops polling when stop is called", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "job-1", containerId: "container-1", name: "test-job", type: "http" },
    ];
    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker, 100);

    consumer.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(docker.inspectContainer).toHaveBeenCalledTimes(1);

    consumer.stop();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    // Should not have been called again after stop
    expect(docker.inspectContainer).toHaveBeenCalledTimes(1);
  });
});
