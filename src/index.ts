// ABOUTME: Server entrypoint - starts the Express app on a configured port.
// ABOUTME: Separated from app.ts so tests can import the app without starting the server.

import app from "./app";
import logger from "./logger";

const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});
