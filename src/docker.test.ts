// ABOUTME: Tests for Docker container management using dockerode.
// ABOUTME: Tests verify the docker module interface and logging behavior.

import { describe, expect, test } from "bun:test";
import Docker from "dockerode";
import type { DockerClient, ContainerInfo } from "./docker";
import { createDockerClient } from "./docker";
import type { Logger } from "pino";
import { Writable } from "stream";
import pino from "pino";

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});
const silentLogger = pino(devNull);

interface MockDockerClient extends DockerClient {
  getHttpServerCalls: () => { name: string; port: number | string }[];
  getBrowserCalls: () => { name: string; cdpPort: number | string }[];
}

function createMockDockerClient(
  httpServerFn?: (jobId: string, name: string, port: number | string) => Promise<ContainerInfo>,
  browserFn?: (jobId: string, name: string, cdpPort: number | string) => Promise<ContainerInfo>
): MockDockerClient {
  const httpCalls: { name: string; port: number | string }[] = [];
  const browserCalls: { name: string; cdpPort: number | string }[] = [];

  return {
    runHttpServer: async (jobId: string, name: string, port: number | string) => {
      httpCalls.push({ name, port });
      if (httpServerFn) {
        return httpServerFn(jobId, name, port);
      }
      return { id: "mock-id", url: `http://localhost:${port}`, name };
    },
    runBrowser: async (jobId: string, name: string, cdpPort: number | string) => {
      browserCalls.push({ name, cdpPort });
      if (browserFn) {
        return browserFn(jobId, name, cdpPort);
      }
      return { id: "mock-id", url: `http://localhost:${cdpPort}`, cdpUrl: `ws://localhost:${cdpPort}`, name };
    },
    inspectContainer: async (_containerId: string) => ({
      id: "mock-id",
      state: { status: "running", running: true },
    }),
    getHttpServerCalls: () => httpCalls,
    getBrowserCalls: () => browserCalls,
  };
}

describe("DockerClient runHttpServer", () => {
  test("starts HTTP server container and returns URL", async () => {
    const docker = createMockDockerClient((_jobId, name, port) => {
      return Promise.resolve({
        id: "container-123",
        url: `http://localhost:${port}`,
        name,
      });
    });

    const info = await docker.runHttpServer("job-123", "test-job", 8080);

    expect(info.id).toBe("container-123");
    expect(info.url).toBe("http://localhost:8080");
    expect(info.name).toBe("test-job");
  });

  test("logs when starting HTTP server container", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger: Logger = pino(stream);

    const docker = createMockDockerClient((_jobId, name, port) => {
      capturingLogger.info({ name, port }, `Starting HTTP server for ${name} on port ${port}`);
      return Promise.resolve({
        id: "container-123",
        url: `http://localhost:${port}`,
        name,
      });
    });

    await docker.runHttpServer("job-456", "my-job", 3000);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const logs = chunks.map((c: string) => JSON.parse(c) as { msg?: string; name?: string });
    const startLog = logs.find((l) => l.msg?.includes("Starting HTTP server"));
    expect(startLog).toBeDefined();
    expect(startLog?.name).toBe("my-job");
  });

  test("returns unique URL with port for each container", async () => {
    const docker = createMockDockerClient((_jobId, name, port) => {
      return Promise.resolve({
        id: `container-${port}`,
        url: `http://localhost:${port}`,
        name,
      });
    });

    const info1 = await docker.runHttpServer("job-id-1", "job-1", 3001);
    const info2 = await docker.runHttpServer("job-id-2", "job-2", 3002);

    expect(info1.url).toBe("http://localhost:3001");
    expect(info2.url).toBe("http://localhost:3002");
    expect(info1.url).not.toBe(info2.url);
  });

  test("handles container start errors gracefully", async () => {
    const docker = createMockDockerClient(() => {
      return Promise.reject(new Error("Port already in use"));
    });

    await expect(docker.runHttpServer("job-123", "test-job", 8080)).rejects.toThrow(
      "Port already in use"
    );
  });
});

describe("DockerClient labels (integration)", () => {
  test("runHttpServer applies duvo.managed=true label", async () => {
    const docker = createDockerClient(silentLogger);
    const container = await docker.runHttpServer("job-123", "test-job", 0);

    const dockerode = new Docker();
    const containerInfo = await dockerode.getContainer(container.id).inspect();

    expect(containerInfo.Config.Labels["duvo.managed"]).toBe("true");
    expect(containerInfo.Config.Labels["duvo.job.name"]).toBe("test-job");
    expect(containerInfo.Config.Labels["duvo.job.type"]).toBe("http");
  });
});
