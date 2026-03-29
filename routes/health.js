
const mongoose = require('mongoose');
const express = require('express');

const router = express.Router();

// Health check - liveness probe (always 200 if server is running)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Readiness check - returns 200 only if DB is connected and ready
router.get('/ready', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1; // 1 = connected

  if (!dbConnected) {
    return res.status(503).json({
      status: 'not-ready',
      timestamp: new Date().toISOString(),
      reason: 'Database not connected',
      dbState: mongoose.connection.readyState
    });
  }

  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    database: 'connected',
    uptime: process.uptime()
  });
});

module.exports = router;
