import WebSocket from "ws";
import Alert from "../models/Alert.js";
import { mapToMitre } from "./mitreService.js";
import { scoreAlertSeverity } from "./severityService.js";

let reconnectTimeout;
let ws;

const DEFAULT_SINGLE_DONGLE_ALERTS = [
  "DEAUTHFLOOD",
  "DISASSOCFLOOD",
  "BEACONFLOOD",
  "PROBERESP",
  "SSIDCONFLICT",
  "MACCONFLICT",
  "NULLPROBERESP"
];

function parseBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvSet(value) {
  const items = String(value || "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

function extractNumber(...candidates) {
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function extractChannel(data) {
  return extractNumber(
    data.channel,
    data.chan,
    data.dot11_channel,
    data?.kismet?.channel
  );
}

function extractFrequency(data) {
  return extractNumber(
    data.frequency,
    data.freq,
    data.channel_frequency,
    data?.kismet?.frequency
  );
}

function buildRuntimeConfig() {
  const singleDongleMode = parseBoolean(process.env.SINGLE_DONGLE_MODE);
  const minSignalDbm = parseNumber(process.env.MIN_SIGNAL_DBM, singleDongleMode ? -85 : -100);
  const dedupeWindowSeconds = parseNumber(process.env.DEDUPE_WINDOW_SECONDS, 8);
  const configuredAllowedAlerts = parseCsvSet(process.env.KISMET_ALLOWED_ALERTS);
  const allowedAlerts = configuredAllowedAlerts || (singleDongleMode ? new Set(DEFAULT_SINGLE_DONGLE_ALERTS) : null);

  return {
    singleDongleMode,
    minSignalDbm,
    dedupeWindowSeconds,
    allowedAlerts
  };
}

export function startKismetListener(io) {
  connectToKismet(io);
}

function connectToKismet(io, retryCount = 0) {
  const maxRetries = 10;
  const retryDelay = Math.min(5000 * Math.pow(1.5, retryCount), 60000); // Max 60s

  try {
    ws = new WebSocket("ws://localhost:2501/alerts/alerts.ws");

    ws.on("open", () => {
      console.log("✅ Connected to Kismet Alerts API");
      retryCount = 0; // Reset retry count on successful connection
    });

    ws.on("error", (err) => {
      if (err.code === 'ECONNREFUSED') {
        console.log("⚠️  Kismet not running yet. Will retry...");
      } else {
        console.error("❌ Kismet WebSocket error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("🔌 Kismet connection closed. Reconnecting...");

      // Clear existing timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      // Attempt reconnection with exponential backoff
      if (retryCount < maxRetries) {
        reconnectTimeout = setTimeout(() => {
          console.log(`🔄 Reconnection attempt ${retryCount + 1}/${maxRetries}...`);
          connectToKismet(io, retryCount + 1);
        }, retryDelay);
      } else {
        console.error("❌ Max Kismet reconnection attempts reached. Manual restart required.");
      }
    });

    ws.on("message", async (msg) => {
      try {
        const runtime = buildRuntimeConfig();
        const data = JSON.parse(msg.toString());

        // Validate incoming data
        if (!data.alert) {
          console.warn("⚠️  Received alert without type:", data);
          return;
        }

        const alertType = String(data.alert).trim().toUpperCase();

        // Single-dongle mode can restrict noisy/low-value event types.
        if (runtime.allowedAlerts && !runtime.allowedAlerts.has(alertType)) {
          return;
        }

        const signal = Number.isFinite(Number(data.signal)) ? Number(data.signal) : 0;
        if (runtime.singleDongleMode && signal < runtime.minSignalDbm) {
          return;
        }

        const channel = extractChannel(data);
        const frequency = extractFrequency(data);
        const sourceMac = data.source_mac || "Unknown";
        const destMac = data.dest_mac || "Unknown";
        const bssid = data.bssid || "Unknown";
        const now = new Date();

        // Deduplicate bursty alerts from one adapter/channel-hopping setups.
        const dedupeStart = new Date(now.getTime() - runtime.dedupeWindowSeconds * 1000);
        const existing = await Alert.findOne({
          source: "kismet",
          type: alertType,
          source_mac: sourceMac,
          bssid,
          timestamp: { $gte: dedupeStart }
        }).sort({ timestamp: -1 });

        if (existing) {
          existing.occurrenceCount += 1;
          existing.lastSeen = now;
          existing.timestamp = now;
          existing.signal = signal;
          if (channel !== null) {
            existing.channel = channel;
          }
          if (frequency !== null) {
            existing.frequency = frequency;
          }

          const updatedSeverity = scoreAlertSeverity({
            type: existing.type,
            signal,
            occurrenceCount: existing.occurrenceCount
          });
          existing.severityScore = updatedSeverity.severityScore;
          existing.severityLevel = updatedSeverity.severityLevel;

          await existing.save();
          io.emit("new-alert", existing);
          console.log(`🔁 Alert deduped: ${alertType} (ID: ${existing._id}, count: ${existing.occurrenceCount})`);
          return;
        }

        const mitre = mapToMitre(alertType);
        const severity = scoreAlertSeverity({
          type: alertType,
          signal,
          occurrenceCount: 1
        });

        const alert = await Alert.create({
          type: alertType,
          source_mac: sourceMac,
          dest_mac: destMac,
          bssid,
          channel,
          frequency,
          signal,
          timestamp: now,
          source: "kismet",
          firstSeen: now,
          lastSeen: now,
          occurrenceCount: 1,
          severityScore: severity.severityScore,
          severityLevel: severity.severityLevel,
          mitre
        });

        // Broadcast to all connected clients
        io.emit("new-alert", alert);

        console.log(`🚨 Alert stored: ${alertType} (ID: ${alert._id})`);

      } catch (err) {
        console.error("❌ Error processing Kismet alert:", err.message);

        // If database error, still log the alert data
        if (err.name === 'ValidationError' || err.name === 'MongoError') {
          console.error("Database error. Alert data:", msg.toString().substring(0, 200));
        }
      }
    });

  } catch (err) {
    console.error("❌ Failed to create Kismet WebSocket:", err.message);

    // Retry connection
    if (retryCount < maxRetries) {
      reconnectTimeout = setTimeout(() => {
        connectToKismet(io, retryCount + 1);
      }, retryDelay);
    }
  }
}

// Graceful shutdown
export function stopKismetListener() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  if (ws) {
    ws.close();
  }
}