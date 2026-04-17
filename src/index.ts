// ABOUTME: Server entrypoint - starts the Express app and jobs consumer.
// ABOUTME: Separated from app.ts so tests can import the app without starting the server.

import { createApp, type Job } from "./app";
import { createConsumer, type RunningContainer } from "./consumer";
import { createDockerClient } from "./docker";
import logger from "./logger";

const port = process.env.PORT || 3000;

// Shared jobs queue between HTTP API and consumer
const jobs: Job[] = [];
const runningContainers: RunningContainer[] = [];

const app = createApp(logger, jobs);
const docker = createDockerClient(logger.child({ component: "docker" }));
const consumer = createConsumer(jobs, runningContainers, logger.child({ component: "consumer" }), docker);

async function start() {
  try {
    await docker.reapLeftoverContainers();
  } catch (err) {
    logger.error({ err }, "Failed to reap leftover labeled Docker containers");
  }

  consumer.start();
  logger.info("Jobs consumer started (polling every 5s)");
}

void start();

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

// Graceful shutdown
function shutdown() {
  logger.info("Shutting down...");
  consumer.stop();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
