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
  reapLeftoverContainers: () => Promise<void>;
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
          "duvo.job.id": String(jobId),
          "duvo.job.name": String(name),
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
          "duvo.job.id": String(jobId),
          "duvo.job.name": String(name),
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
    try {
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      return {
        id: info.Id,
        state: {
          status: info.State.Status,
          running: info.State.Running,
        },
      };
    } catch (err) {
      logger.error({ err, containerId }, "Failed to inspect container");
      throw err;
    }
  }

  async function reapLeftoverContainers() {
    const containers = await docker.listContainers({
      all: true,
      filters: {
        label: ["duvo.managed=true"],
      },
    });

    if (containers.length === 0) {
      logger.info("No leftover labeled Docker containers found");
      return;
    }

    for (const leftover of containers) {
      logger.warn(
        {
          containerId: leftover.Id,
          names: leftover.Names,
          state: leftover.State,
          status: leftover.Status,
          labels: leftover.Labels,
        },
        "Found leftover labeled Docker container; removing it"
      );

      const container = docker.getContainer(leftover.Id);
      try {
        if (leftover.State === "running") {
          await container.stop();
        }
      } catch (err) {
        logger.warn({ err, containerId: leftover.Id }, "Failed stopping leftover container; continuing");
      }

      try {
        await container.remove({ force: true });
        logger.info({ containerId: leftover.Id }, "Removed leftover Docker container");
      } catch (err) {
        logger.warn({ err, containerId: leftover.Id }, "Failed removing leftover container; it may already be gone");
      }
    }
  }

  return {
    runHttpServer,
    runBrowser,
    inspectContainer,
    reapLeftoverContainers,
  };
}
