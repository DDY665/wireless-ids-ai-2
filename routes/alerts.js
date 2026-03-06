import express from "express";
import Alert from "../models/Alert.js";
import mongoose from "mongoose";
import { mapToMitre, getAvailableMappings } from "../services/mitreService.js";

const router = express.Router();


// Helper: Validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}


// TEST ALERT ROUTE (must be first)
router.get("/test", async (req, res) => {
  try {
    const requestedType = (req.query.type || "DEAUTHFLOOD").toString().toUpperCase();
    const signal = Number.isFinite(Number(req.query.signal)) ? Number(req.query.signal) : -42;
    const mitre = mapToMitre(requestedType);

    const alert = await Alert.create({
      type: requestedType,
      source_mac: "AA:BB:CC:DD:EE:01",
      dest_mac: "FF:FF:FF:FF:FF:FF",
      bssid: "11:22:33:44:55:66",
      signal,
      timestamp: new Date(),
      mitre
    });

    res.json({
      success: true,
      message: "Dummy alert created",
      alert,
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
router.post("/test/bulk", async (req, res) => {
  try {
    const requestedTypes = Array.isArray(req.body?.types) && req.body.types.length
      ? req.body.types.map((t) => String(t).toUpperCase())
      : getAvailableMappings();

    const created = [];

    for (const type of requestedTypes) {
      const mitre = mapToMitre(type);

      const alert = await Alert.create({
        type,
        source_mac: "AA:BB:CC:DD:EE:01",
        dest_mac: "FF:FF:FF:FF:FF:FF",
        bssid: "11:22:33:44:55:66",
        signal: -35 - Math.floor(Math.random() * 40),
        timestamp: new Date(),
        mitre
      });

      created.push(alert);
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
router.delete("/reset", async (req, res) => {
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

    const alerts = await Alert.find()
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


export default router;