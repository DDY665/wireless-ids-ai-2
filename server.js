import dotenv from "dotenv";
dotenv.config();


import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import aiRoute from "./routes/ai.js";

import { connectDB } from "./config/db.js";
import alertsRoute from "./routes/alerts.js";
import { startKismetListener } from "./services/kismetListener.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

connectDB();

app.use(cors());
app.use(express.json());

app.use("/alerts", alertsRoute);
app.use("/ai", aiRoute);

// 404 Handler - must come after all routes
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    availableRoutes: ["/alerts", "/ai/chat"]
  });
});

// Global Error Handler - must be last
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err.message
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid ID format",
      details: "The provided ID is not a valid MongoDB ObjectId"
    });
  }

  if (err.code === "GROQ_API_KEY_MISSING") {
    return res.status(500).json({
      error: "Configuration Error",
      message: "AI service is not configured properly"
    });
  }

  // Generic error response
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

const shouldEnableKismet = process.env.ENABLE_KISMET === "true";
const port = Number(process.env.PORT) || 5000;

if (shouldEnableKismet) {
  startKismetListener(io);
  console.log("Kismet listener enabled");
} else {
  console.log("Kismet listener disabled (set ENABLE_KISMET=true to enable)");
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing process or set PORT to a different value in .env.`);
  } else {
    console.error("Server startup error:", err.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Process-level error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason);
  console.error("Promise:", promise);
  // Don't exit in production, just log
  if (process.env.NODE_ENV === "development") {
    process.exit(1);
  }
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  console.error("Stack:", err.stack);
  // Graceful shutdown
  server.close(() => {
    console.log("Server closed due to uncaught exception");
    process.exit(1);
  });
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error("Forced shutdown after uncaught exception");
    process.exit(1);
  }, 5000);
});

// Graceful shutdown on SIGTERM/SIGINT
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));