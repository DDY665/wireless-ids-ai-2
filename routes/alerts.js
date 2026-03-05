import express from "express";
import Alert from "../models/Alert.js";

const router = express.Router();


// TEST ALERT ROUTE (must be first)
router.get("/test", async (req, res) => {

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

  res.json(alert);

});


// GET ALL ALERTS
router.get("/", async (req, res) => {

  const alerts = await Alert.find().sort({ timestamp: -1 }).limit(50);

  res.json(alerts);

});


// GET ALERT BY ID
router.get("/:id", async (req, res) => {

  const alert = await Alert.findById(req.params.id);

  res.json(alert);

});


export default router;