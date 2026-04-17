// ABOUTME: Jobs queue consumer that polls every 5 seconds to process jobs.
// ABOUTME: Removes jobs from queue after processing. Uses pino for logging.
// ABOUTME: Starts Docker containers for each job using dockerode.

import type { Logger } from "pino";
import type { Job } from "./app";
import { createDockerClient, type DockerClient } from "./docker";

export type Consumer = {
  start: () => void;
  stop: () => void;
};

export function createConsumer(
  jobs: Job[],
  logger: Logger,
  docker: DockerClient = createDockerClient(logger.child({ component: "docker" }))
): Consumer {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isProcessing = false;

  async function processNext() {
    const job = jobs.shift();
    if (!job) {
      logger.info("No jobs to process");
      return;
    }

    logger.info({ job }, `Processing job: ${job.name}`);

    try {
      let container;
      if (job.type === "browser") {
        container = await docker.runBrowser(job.id, job.name, "");
      } else {
        container = await docker.runHttpServer(job.id, job.name, "");
      }
      logger.info({ jobId: job.id, container }, "Job processed successfully");
    } catch (err) {
      logger.error({ err, jobId: job.id }, "Job failed - container error");
    }
  }

  return {
    start() {
      logger.info("Starting consumer");
      if (intervalId) {
        return;
      }
      // Process immediately, then poll every 5 seconds
      void processNext();
      intervalId = setInterval(() => void processNext(), 5000);
    },
    stop() {
      logger.info("Stopping consumer");
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
