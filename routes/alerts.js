
const express = require("express");
const Alert = require("../models/Alert.js");
const mongoose = require("mongoose");
const { mapToMitre, getAvailableMappings } = require("../services/mitreService.js");
const { scoreAlertSeverity } = require("../services/severityService.js");
const { requireApiKey } = require("../middleware/auth.js");

const router = express.Router();

// CORRELATION WINDOW: 5 minutes
const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

// Helper: Validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function buildAlertsQuery(rawQuery = {}) {
  const query = {};

  if (rawQuery.status && rawQuery.status !== "all") {
    query.status = rawQuery.status;
  }

  if (rawQuery.severityLevel && rawQuery.severityLevel !== "all") {
    query.severityLevel = rawQuery.severityLevel;
  }

  if (rawQuery.type && rawQuery.type !== "all") {
    query.type = String(rawQuery.type).toUpperCase();
  }

  if (rawQuery.source && rawQuery.source !== "all") {
    query.source = rawQuery.source;
  }

  if (rawQuery.mitreTechnique && rawQuery.mitreTechnique !== "all") {
    query["mitre.technique_id"] = String(rawQuery.mitreTechnique).toUpperCase();
  }

  if (rawQuery.correlatedOnly === "true") {
    query.correlationCount = { $gt: 1 };
  }

  const search = typeof rawQuery.search === "string" ? rawQuery.search.trim() : "";
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [
      { type: regex },
      { source_mac: regex },
      { dest_mac: regex },
      { bssid: regex },
      { "mitre.technique_id": regex },
      { "mitre.name": regex }
    ];
  }

  return query;
}

/**
 * Find correlated alerts for a given alert
 * Correlates by: type, source_mac, dest_mac, bssid, within time window
 */
async function findCorrelatedAlerts(alert, timeWindowMs = CORRELATION_WINDOW_MS) {
  const timeWindow = new Date(alert.timestamp.getTime() - timeWindowMs);

  return Alert.find({
    type: alert.type,
    source_mac: alert.source_mac,
    dest_mac: alert.dest_mac,
    bssid: alert.bssid,
    timestamp: {
      $gte: timeWindow,
      $lte: new Date(alert.timestamp.getTime() + timeWindowMs)
    }
  }).sort({ timestamp: 1 });
}

/**
 * Create or update correlation group
 * Assigns same correlationId to all related alerts
 */
async function updateAlertCorrelation(alert) {
  const relatedAlerts = await findCorrelatedAlerts(alert);

  if (relatedAlerts.length <= 1) {
    // Single alert, no correlation needed
    await Alert.findByIdAndUpdate(alert._id, {
      correlationId: null,
      correlationCount: 1
    });
    return alert;
  }

  // Create or use existing correlationId
  let correlationId = alert.correlationId || `corr_${new Date().getTime()}_${Math.random().toString(36).substring(7)}`;

  // Update all related alerts with same correlationId and count
  await Alert.updateMany(
    {
      type: alert.type,
      source_mac: alert.source_mac,
      dest_mac: alert.dest_mac,
      bssid: alert.bssid,
      timestamp: {
        $gte: new Date(alert.timestamp.getTime() - CORRELATION_WINDOW_MS),
        $lte: new Date(alert.timestamp.getTime() + CORRELATION_WINDOW_MS)
      }
    },
    {
      correlationId,
      correlationCount: relatedAlerts.length
    }
  );

  return Alert.findById(alert._id);
}



// TEST ALERT ROUTE (must be first)
router.get("/test", requireApiKey, async (req, res) => {
  try {
    const requestedType = (req.query.type || "DEAUTHFLOOD").toString().toUpperCase();
    const signal = Number.isFinite(Number(req.query.signal)) ? Number(req.query.signal) : -42;
    const mitre = mapToMitre(requestedType);
    const severity = scoreAlertSeverity({
      type: requestedType,
      signal,
      occurrenceCount: 1
    });

    const alert = await Alert.create({
      type: requestedType,
      source_mac: "AA:BB:CC:DD:EE:01",
      dest_mac: "FF:FF:FF:FF:FF:FF",
      bssid: "11:22:33:44:55:66",
      signal,
      timestamp: new Date(),
      source: "simulated",
      firstSeen: new Date(),
      lastSeen: new Date(),
      occurrenceCount: 1,
      severityScore: severity.severityScore,
      severityLevel: severity.severityLevel,
      mitre
    });

    // Apply correlation
    const correlatedAlert = await updateAlertCorrelation(alert);

    res.json({
      success: true,
      message: "Dummy alert created",
      alert: correlatedAlert,
      availableTypes: getAvailableMappings()
    });
  } catch (err) {
    console.error("Test alert creation failed:", err);
    res.status(500).json({
      error: "Failed to create test alert",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// BULK TEST ALERT ROUTE
router.post("/test/bulk", requireApiKey, async (req, res) => {
  try {
    const requestedTypes = Array.isArray(req.body?.types) && req.body.types.length
      ? req.body.types.map((t) => String(t).toUpperCase())
      : getAvailableMappings();

    const created = [];

    for (const type of requestedTypes) {
      const mitre = mapToMitre(type);
      const signal = -35 - Math.floor(Math.random() * 40);
      const severity = scoreAlertSeverity({
        type,
        signal,
        occurrenceCount: 1
      });

      const alert = await Alert.create({
        type,
        source_mac: "AA:BB:CC:DD:EE:01",
        dest_mac: "FF:FF:FF:FF:FF:FF",
        bssid: "11:22:33:44:55:66",
        signal,
        timestamp: new Date(),
        source: "simulated",
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        severityScore: severity.severityScore,
        severityLevel: severity.severityLevel,
        mitre
      });

      // Apply correlation
      const correlatedAlert = await updateAlertCorrelation(alert);
      created.push(correlatedAlert);
    }

    res.json({
      success: true,
      count: created.length,
      alerts: created
    });
  } catch (err) {
    console.error("Bulk test alert creation failed:", err);
    res.status(500).json({
      error: "Failed to create bulk test alerts",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

// CLEAR ALL ALERTS (testing utility)
router.delete("/reset", requireApiKey, async (req, res) => {
  try {
    const result = await Alert.deleteMany({});
    res.json({
      success: true,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("Failed to clear alerts:", err);
    res.status(500).json({
      error: "Failed to clear alerts",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});


// GET ALL ALERTS
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = parseInt(req.query.skip) || 0;
    const query = buildAlertsQuery(req.query);

    const alerts = await Alert.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    res.json(alerts);
  } catch (err) {
    console.error("Error fetching alerts:", err);
    res.status(500).json({
      error: "Failed to fetch alerts",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


// GET ALERT BY ID
router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.json(alert);
  } catch (err) {
    console.error("Error fetching alert:", err);
    res.status(500).json({
      error: "Failed to fetch alert",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET CORRELATED ALERTS FOR A GIVEN ALERT
router.get("/:id/correlation", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    if (!alert.correlationId) {
      return res.json({
        correlationId: null,
        count: 1,
        alerts: [alert]
      });
    }

    const correlatedAlerts = await Alert.find({
      correlationId: alert.correlationId
    }).sort({ timestamp: -1 });

    res.json({
      correlationId: alert.correlationId,
      count: correlatedAlerts.length,
      alerts: correlatedAlerts
    });
  } catch (err) {
    console.error("Error fetching correlated alerts:", err);
    res.status(500).json({
      error: "Failed to fetch correlated alerts",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});


// UPDATE ALERT STATUS / NOTES
router.patch("/:id/status", requireApiKey, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const { status, analystNotes } = req.body || {};
    const allowedStatuses = ["new", "triaged", "investigating", "resolved", "false_positive"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        allowedStatuses
      });
    }

    const updated = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(typeof analystNotes === "string" ? { analystNotes } : {}),
        lastSeen: new Date()
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.json({ success: true, alert: updated });
  } catch (err) {
    console.error("Error updating alert status:", err);
    res.status(500).json({
      error: "Failed to update alert status",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});


module.exports = router;