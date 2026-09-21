import http from "http";
import os from "os";
import cluster from "cluster";
import { createTerminus } from "@godaddy/terminus";
import app from "./config/app.js";
import config from "./config/env.js";
import { disconnectMongoDB } from "./config/mongodb.js";
import { disconnectRedis } from "./config/redis.js";
import { logger } from "./config/logger.js";
import { closeBullMQ } from "./config/bullmq.js";
// import { disconnectDB } from "./config/database.js";
// import { setupWebSocket } from "./websocket/index.js";
import { initSocket } from "./socket/socket.js";

const PORT = config.get("port");

// ========================
// Start Server Function
// ========================
const startServer = async () => {
  try {
    const server = http.createServer(app);
    // setupWebSocket(server);
    initSocket(server);
    server.keepAliveTimeout = 120000; // 2 minutes
    server.headersTimeout = 120000;
    // ========================
    // Graceful Shutdown
    // ========================
    createTerminus(server, {
      signals: ["SIGINT", "SIGTERM"],
      timeout: 5000, // 5 seconds timeout for shutdown
      healthChecks: {
        "/server-health": async () => {
          return Promise.resolve({ status: "ok" });
        },
      },
      onSignal: async () => {
        logger.info("⚠️ Closing connections...");
        await Promise.all([
          // disconnectDB(),
          disconnectRedis(),
          disconnectMongoDB(),
          closeBullMQ(),
        ]);
      },
      onShutdown: () => {
        logger.info("✅ Clean shutdown complete");
        return Promise.resolve();
      },
      logger: (msg, err) => {
        if (err) {
          logger.error("❌ Terminus error:", err);
        } else {
          logger.info(msg);
        }
      },
    });

    // ========================
    // Start Server
    // ========================
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`
        ################################################
        🚀 HTTP Server: http://localhost:${PORT} 🚀
        🚀 WebSocket Server: ws://localhost:${PORT}/ws 🚀
        📚 API documentation:  http://localhost:${PORT}/api-docs
        🌍 Environment: ${config.get("env")}
        🛠️  Worker PID: ${process.pid}
        ################################################
      `);
      // logger.info(`
      //   ################################################
      //   Server running on http://localhost:${PORT}
      //   WebSocket Server: ws://localhost:${PORT}/ws
      //   Environment: ${config.get("env")}
      //   Worker PID: ${process.pid}
      //   ################################################
      // `);
    });

    return server;
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// ========================
// Clustering (Only for Production)
// ========================
if (config.get("env") === "production") {
  const numCPUs = os.cpus().length;

  if (cluster.isPrimary) {
    logger.info(`🟢 Primary process ${process.pid} is running`);

    // Fork workers for each CPU core
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    // Handle worker exit events
    cluster.on("exit", (worker) => {
      logger.error(`⚠️ Worker ${worker.process.pid} died`);
      cluster.fork(); // Restart the worker
    });
  } else {
    startServer(); // Start server in worker process
  }
} else {
  startServer(); // Start server in development mode
}
