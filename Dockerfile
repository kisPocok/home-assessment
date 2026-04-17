# Stage 1: Dependencies
FROM oven/bun:alpine AS deps

# Expose the HTTP server port
EXPOSE 3000

# Run the server
USER bun
CMD ["echo", "Hello, World!"]
