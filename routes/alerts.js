import express from "express";
import Alert from "../models/Alert.js";
import mongoose from "mongoose";

const router = express.Router();


// Helper: Validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}


// TEST ALERT ROUTE (must be first)
router.get("/test", async (req, res) => {
  try {
    const alert = await Alert.create({
      type: "DEAUTHFLOOD",
      source_mac: "AA:BB:CC:DD:EE:01",
      dest_mac: "FF:FF:FF:FF:FF:FF",
      bssid: "11:22:33:44:55:66",
      signal: -42,
      timestamp: new Date(),

      mitre: {
        technique_id: "T1499",
        name: "Endpoint Denial of Service",
        tactic: "impact",
        description: "Adversaries may perform DoS attacks."
      }
    });

    res.json({ success: true, alert });
  } catch (err) {
    console.error("Test alert creation failed:", err);
    res.status(500).json({ 
      error: "Failed to create test alert",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
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