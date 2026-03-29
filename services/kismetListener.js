
const axios = require("axios");
const Alert = require("../models/Alert.js");
const { mapToMitre } = require("./mitreService.js");
const { scoreAlertSeverity } = require("./severityService.js");


let pollInterval = Number(process.env.KISMET_POLL_INTERVAL) || 5; // seconds
let pollTimer = null;
const seenAlertIds = new Set();

function getKismetConfig() {
  return {
    host: process.env.KISMET_HOST || "localhost",
    port: process.env.KISMET_PORT || 2501,
    user: process.env.KISMET_USER || "",
    password: process.env.KISMET_PASSWORD || "",
    endpoint: process.env.KISMET_ALERTS_ENDPOINT || "/alerts/all_alerts.json"
  };
}

function getAlertId(alert) {
  return (
    alert["kismet.alert.hash"] ||
    alert["kismet.alert.uuid"] ||
    alert["kismet.alert.timestamp"] ||
    null
  );
}

async function fetchKismetAlerts() {
  const { host, port, user, password, endpoint } = getKismetConfig();
  const url = `http://${host}:${port}${endpoint}`;
  try {
    const response = await axios.get(url, {
      auth: user && password ? { username: user, password: password } : undefined,
      timeout: 5000
    });
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (err) {
    console.error("[Kismet REST] Error fetching alerts:", err.message);
    return [];
  }
}

function startKismetListener(io) {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(async () => {
    const alerts = await fetchKismetAlerts();
    for (const alert of alerts) {
      const alertId = getAlertId(alert);
      if (!alertId || seenAlertIds.has(alertId)) continue;
      seenAlertIds.add(alertId);

      // Parse alert fields
      const alertType = alert["kismet.alert.class"] || "UNKNOWN";
      const sourceMac = alert["kismet.alert.transmitter_mac"] || "Unknown";
      const destMac = alert["kismet.alert.dest_mac"] || "Unknown";
      const channel = alert["kismet.alert.channel"] || null;
      const frequency = alert["kismet.alert.frequency"] || null;
      const signal = alert["kismet.alert.signal_dbm"] || 0;
      // Always use current time for alert timestamp
      const timestamp = Date.now();
      const text = alert["kismet.alert.text"] || "No description";

      // Store in DB and emit to clients
      try {
        const mitre = mapToMitre(alertType);
        const severity = scoreAlertSeverity({
          type: alertType,
          signal,
          occurrenceCount: 1
        });

        const newAlert = await Alert.create({
          type: alertType,
          source_mac: sourceMac,
          dest_mac: destMac,
          channel,
          frequency,
          signal,
          timestamp: new Date(Number(timestamp)),
          source: "kismet",
          firstSeen: new Date(),
          lastSeen: new Date(),
          occurrenceCount: 1,
          severityScore: severity.severityScore,
          severityLevel: severity.severityLevel,
          mitre,
          text
        });
        io.emit("new-alert", newAlert);
        console.log(`🚨 Alert stored: ${alertType} (ID: ${newAlert._id})`);
      } catch (err) {
        console.error("[Kismet REST] Error storing alert:", err.message);
      }
    }
  }, pollInterval * 1000);
  console.log(`[Kismet REST] Polling for alerts every ${pollInterval} seconds...`);
}

function stopKismetListener() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { startKismetListener, stopKismetListener };