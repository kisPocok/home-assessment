// ABOUTME: Docker container management using dockerode.
// ABOUTME: Provides a wrapper around dockerode for starting and managing containers.

import Docker from "dockerode";
import type { Logger } from "pino";

export type ContainerInfo = {
  id: string;
  url: string;
  name: string;
  cdpUrl?: string;
};

export type DockerClient = {
  runHttpServer: (jobId: string, name: string, port: number | string) => Promise<ContainerInfo>;
  runBrowser: (jobId: string, name: string, cdpPort: number | string) => Promise<ContainerInfo>;
  inspectContainer: (containerId: string) => Promise<{ id: string; state: { status: string; running: boolean } }>;
};

export function createDockerClient(logger: Logger): DockerClient {
  const docker = new Docker();

  async function runHttpServer(jobId: string, name: string, port: number | string): Promise<ContainerInfo> {
    logger.info({ jobId, name, port }, `Starting HTTP server container for ${name}`);

    try {
      const container = await docker.createContainer({
        Image: "nginx:alpine",
        name: `job-${name}-${Date.now()}`,
        Labels: {
          "duvo.managed": "true",
          "duvo.job.id": jobId,
          "duvo.job.name": name,
          "duvo.job.type": "http",
        },
        HostConfig: {
          PortBindings: {
            "80/tcp": [{ HostPort: port.toString() }],
          },
          AutoRemove: true,
        },
        ExposedPorts: {
          "80/tcp": {},
        },
      });

      await container.start();

      const url = `http://localhost:${port}`;
      logger.info({ containerId: container.id, url, name }, "HTTP server container started");

      return {
        id: container.id,
        url,
        name,
      };
    } catch (err) {
      logger.error({ err, jobId, name, port }, "Failed to start HTTP server container");
      throw err;
    }
  }

  async function runBrowser(jobId: string, name: string, cdpPort: number | string): Promise<ContainerInfo> {
    logger.info({ jobId, name, cdpPort }, `Starting browser container for ${name}`);

    try {
      const container = await docker.createContainer({
        Image: "browserless/chrome:latest",
        name: `job-${name}-${Date.now()}`,
        Labels: {
          "duvo.managed": "true",
          "duvo.job.id": jobId,
          "duvo.job.name": name,
          "duvo.job.type": "browser",
        },
        HostConfig: {
          PortBindings: {
            "3000/tcp": [{ HostPort: cdpPort.toString() }],
          },
          AutoRemove: true,
        },
        ExposedPorts: {
          "3000/tcp": {},
        },
        Env: [
          "CONNECTION_TIMEOUT=60000",
          "MAX_CONCURRENT_SESSIONS=1",
        ],
      });

      await container.start();

      const cdpUrl = `ws://localhost:${cdpPort}`;
      const url = `http://localhost:${cdpPort}`;
      logger.info({ containerId: container.id, cdpUrl, name }, "Browser container started");

      return {
        id: container.id,
        url,
        cdpUrl,
        name,
      };
    } catch (err) {
      logger.error({ err, jobId, name, cdpPort }, "Failed to start browser container");
      throw err;
    }
  }

  async function inspectContainer(containerId: string) {
    logger.debug({ containerId }, "Inspecting container");
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return {
      id: info.Id,
      state: {
        status: info.State.Status,
        running: info.State.Running,
      },
    };
  }

  return {
    runHttpServer,
    runBrowser,
    inspectContainer,
  };
}
