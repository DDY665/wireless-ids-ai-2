
const dotenv = require("dotenv");
dotenv.config();



const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const aiRoute = require("./routes/ai.js");


const { connectDB } = require("./config/db.js");
const alertsRoute = require("./routes/alerts.js");
const { startKismetListener } = require("./services/kismetListener.js");
const healthRoute = require("./routes/health.js");
const { requestLogger, errorLogger } = require("./middleware/logging.js");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

connectDB();

app.use(cors());
app.use(express.json());

// Request logging (structured JSON)
app.use(requestLogger);

// Health and readiness probes (should be early in middleware stack)
app.use("/", healthRoute);

app.use("/alerts", alertsRoute);
app.use("/ai", aiRoute);

// Error logger - before global error handler
app.use(errorLogger);

// 404 Handler - must come after all routes
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
    availableRoutes: ["/alerts", "/ai/chat", "/health", "/ready"]
  });
});

// Global Error Handler - must be last (standardized error envelope)
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  let statusCode = 500;
  let errorType = "InternalServerError";
  let message = "An unexpected error occurred";
  let details = undefined;

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    errorType = "ValidationError";
    message = err.message;
    details = Object.keys(err.errors || {}).map(key => ({
      field: key,
      issue: err.errors[key].message
    }));
  } else if (err.name === "CastError") {
    statusCode = 400;
    errorType = "InvalidID";
    message = "The provided ID is not a valid MongoDB ObjectId";
  } else if (err.code === "GROQ_API_KEY_MISSING") {
    statusCode = 500;
    errorType = "ConfigurationError";
    message = "AI service is not configured properly";
  } else if (err.statusCode || err.status) {
    statusCode = err.statusCode || err.status;
    message = err.message || message;
  } else if (err.message) {
    message = err.message;
  }

  // Standardized error response envelope
  res.status(statusCode).json({
    status: 'error',
    error: errorType,
    message: message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
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

// Track active connections for graceful shutdown
let activeConnections = 0;

server.on("connection", (conn) => {
  activeConnections++;
  conn.on("close", () => {
    activeConnections--;
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing process or set PORT to a different value in .env.`);
  } else {
    console.error("Server startup error:", err.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  const startupLog = {
    timestamp: new Date().toISOString(),
    event: 'SERVER_STARTED',
    port: port,
    nodeEnv: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  };
  console.log(JSON.stringify(startupLog));
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

// Graceful shutdown on SIGTERM/SIGINT with connection tracking
const gracefulShutdown = (signal) => {
  const shutdownLog = {
    timestamp: new Date().toISOString(),
    event: 'SHUTDOWN_INITIATED',
    signal: signal,
    activeConnections: activeConnections
  };
  console.log(JSON.stringify(shutdownLog));

  // Stop accepting new connections
  server.close(() => {
    const completedLog = {
      timestamp: new Date().toISOString(),
      event: 'SHUTDOWN_COMPLETED',
      signal: signal
    };
    console.log(JSON.stringify(completedLog));
    process.exit(0);
  });

  // Force exit after 30 seconds if graceful shutdown doesn't complete
  const shutdownTimeout = setTimeout(() => {
    const forcedLog = {
      timestamp: new Date().toISOString(),
      event: 'FORCED_SHUTDOWN',
      signal: signal,
      activeConnections: activeConnections,
      reason: 'graceful shutdown timeout exceeded'
    };
    console.error(JSON.stringify(forcedLog));
    process.exit(1);
  }, 30000);

  // Clear timeout if shutdown completes
  server.once('close', () => clearTimeout(shutdownTimeout));
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));