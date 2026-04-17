// ABOUTME: Polls running containers and logs their status without taking action.

import type { Logger } from "pino";
import type { DockerClient } from "./docker";
import type { RunningContainer } from "./consumer";

export type InsightsConsumer = {
  start: () => void;
  stop: () => void;
};

export function createInsightsConsumer(
  runningContainers: RunningContainer[],
  logger: Logger,
  docker: DockerClient,
  pollIntervalMs: number = 10000
): InsightsConsumer {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function pollContainers() {
    if (runningContainers.length === 0) {
      logger.debug("No running containers to poll");
      return;
    }

    logger.debug({ count: runningContainers.length }, "Polling container statuses");

    for (const container of runningContainers) {
      try {
        const info = await docker.inspectContainer(container.containerId);
        logger.info({
          jobId: container.jobId,
          containerId: container.containerId,
          status: info.state.status,
          running: info.state.running,
          name: container.name,
          type: container.type,
        }, `Container status: ${info.state.status}`);
      } catch (err) {
        logger.error({
          err,
          jobId: container.jobId,
          containerId: container.containerId,
        }, "Failed to inspect container");
      }
    }
  }

  return {
    start() {
      logger.info("Starting insights consumer");
      if (intervalId) {
        return;
      }
      // Poll immediately, then on interval
      void pollContainers();
      intervalId = setInterval(() => void pollContainers(), pollIntervalMs);
    },
    stop() {
      logger.info("Stopping insights consumer");
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
