// ABOUTME: Insights consumer that reads the running containers queue and polls
// ABOUTME: each container's state, logging status changes. Spawns one poller per
// ABOUTME: container and removes the entry when the container stops running.

import type { Logger } from "pino";
import type { RunningContainer } from "./consumer";
import type { DockerClient } from "./docker";

export type InsightsConsumer = {
  start: () => void;
  stop: () => void;
};

const SCAN_INTERVAL_MS = 5000;
const POLL_INTERVAL_MS = 5000;

export function createInsightsConsumer(
  runningContainers: RunningContainer[],
  logger: Logger,
  docker: DockerClient
): InsightsConsumer {
  let scanIntervalId: ReturnType<typeof setInterval> | null = null;
  const pollers = new Map<string, ReturnType<typeof setInterval>>();

  function stopPoller(containerId: string) {
    const id = pollers.get(containerId);
    if (id) {
      clearInterval(id);
      pollers.delete(containerId);
    }
  }

  function removeFromQueue(containerId: string) {
    const idx = runningContainers.findIndex((c) => c.containerId === containerId);
    if (idx >= 0) runningContainers.splice(idx, 1);
  }

  async function pollContainer(rc: RunningContainer) {
    try {
      const info = await docker.inspectContainer(rc.containerId);
      logger.info(
        {
          jobId: rc.jobId,
          containerId: rc.containerId,
          name: rc.name,
          type: rc.type,
          status: info.state.status,
          running: info.state.running,
        },
        `Container ${rc.name} status: ${info.state.status}`
      );

      if (!info.state.running) {
        stopPoller(rc.containerId);
        removeFromQueue(rc.containerId);
      }
    } catch (err) {
      // Treat inspect failure (e.g. container auto-removed) as stopped.
      logger.warn(
        { err, jobId: rc.jobId, containerId: rc.containerId, name: rc.name },
        "Container inspect failed; stopping poller"
      );
      stopPoller(rc.containerId);
      removeFromQueue(rc.containerId);
    }
  }

  function scan() {
    for (const rc of runningContainers) {
      if (pollers.has(rc.containerId)) continue;

      logger.info(
        { jobId: rc.jobId, containerId: rc.containerId, name: rc.name },
        `Starting insights poller for ${rc.name}`
      );

      void pollContainer(rc);
      const id = setInterval(() => void pollContainer(rc), POLL_INTERVAL_MS);
      pollers.set(rc.containerId, id);
    }
  }

  return {
    start() {
      logger.info("Starting insights consumer");
      if (scanIntervalId) return;
      scan();
      scanIntervalId = setInterval(scan, SCAN_INTERVAL_MS);
    },
    stop() {
      logger.info("Stopping insights consumer");
      if (scanIntervalId) {
        clearInterval(scanIntervalId);
        scanIntervalId = null;
      }
      for (const id of pollers.values()) clearInterval(id);
      pollers.clear();
    },
  };
}
