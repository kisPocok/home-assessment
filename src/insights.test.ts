// ABOUTME: Tests for the insights consumer - verifies container state polling,
// ABOUTME: status logging, and cleanup when containers stop running.

import { describe, expect, test, mock } from "bun:test";
import { createInsightsConsumer } from "./insights";
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

type InspectResult = { id: string; state: { status: string; running: boolean } };

function createMockDockerClient(
  inspectFn?: (containerId: string) => Promise<InspectResult>
): DockerClient {
  return {
    runHttpServer: mock(() =>
      Promise.resolve({ id: "x", url: "", name: "" })
    ),
    runBrowser: mock(() =>
      Promise.resolve({ id: "x", url: "", name: "" })
    ),
    inspectContainer: mock(
      inspectFn ??
        ((_containerId: string) =>
          Promise.resolve({
            id: "mock-id",
            state: { status: "running", running: true },
          }))
    ),
    reapLeftoverContainers: mock(() => Promise.resolve()),
  };
}

describe("InsightsConsumer", () => {
  test("starts polling when a running container is in the queue", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
    ];
    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(docker.inspectContainer).toHaveBeenCalledWith("c1");
    consumer.stop();
  });

  test("logs the status returned by inspectContainer", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "my-container", type: "http" },
    ];
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const logger = pino(stream);
    const docker = createMockDockerClient(() =>
      Promise.resolve({ id: "c1", state: { status: "running", running: true } })
    );

    const consumer = createInsightsConsumer(runningContainers, logger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const logs = chunks.map(
      (c) =>
        JSON.parse(c) as {
          status?: string;
          containerId?: string;
          jobId?: string;
          running?: boolean;
        }
    );
    const statusLog = logs.find(
      (l) => l.status === "running" && l.containerId === "c1"
    );
    expect(statusLog).toBeDefined();
    expect(statusLog?.jobId).toBe("j1");
    expect(statusLog?.running).toBe(true);

    consumer.stop();
  });

  test("stops poller and removes entry when container reports not running", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
    ];
    const docker = createMockDockerClient(() =>
      Promise.resolve({ id: "c1", state: { status: "exited", running: false } })
    );

    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(runningContainers).toHaveLength(0);
    consumer.stop();
  });

  test("does not double-poll the same containerId", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
    ];
    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(docker.inspectContainer).toHaveBeenCalledTimes(1);
    consumer.stop();
  });

  test("stop() clears all pollers and prevents further polling", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
    ];
    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const callsBefore = (docker.inspectContainer as ReturnType<typeof mock>).mock
      .calls.length;

    consumer.stop();

    await new Promise<void>((resolve) => setTimeout(resolve, 5200));
    const callsAfter = (docker.inspectContainer as ReturnType<typeof mock>).mock
      .calls.length;
    expect(callsAfter).toBe(callsBefore);
  }, 10000);

  test("handles inspect errors by cleaning up the poller", async () => {
    const runningContainers: RunningContainer[] = [
      { jobId: "j1", containerId: "c1", name: "test", type: "http" },
    ];
    const docker = createMockDockerClient(() =>
      Promise.reject(new Error("No such container"))
    );

    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(runningContainers).toHaveLength(0);
    consumer.stop();
  });

  test("picks up new containers added after start", async () => {
    const runningContainers: RunningContainer[] = [];
    const docker = createMockDockerClient();
    const consumer = createInsightsConsumer(runningContainers, silentLogger, docker);
    consumer.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(docker.inspectContainer).not.toHaveBeenCalled();

    runningContainers.push({
      jobId: "j2",
      containerId: "c2",
      name: "late",
      type: "browser",
    });

    // Wait past the scan interval so the scanner picks up the new entry.
    await new Promise<void>((resolve) => setTimeout(resolve, 5100));

    expect(docker.inspectContainer).toHaveBeenCalledWith("c2");
    consumer.stop();
  }, 10000);
});
