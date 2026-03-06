import WebSocket from "ws";
import Alert from "../models/Alert.js";
import { mapToMitre } from "./mitreService.js";

let reconnectTimeout;
let ws;

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
        const data = JSON.parse(msg.toString());

        // Validate incoming data
        if (!data.alert) {
          console.warn("⚠️  Received alert without type:", data);
          return;
        }

        const mitre = mapToMitre(data.alert);

        const alert = await Alert.create({
          type: data.alert,
          source_mac: data.source_mac || "Unknown",
          dest_mac: data.dest_mac || "Unknown",
          bssid: data.bssid || "Unknown",
          signal: data.signal || 0,
          timestamp: new Date(),
          mitre
        });

        // Broadcast to all connected clients
        io.emit("new-alert", alert);

        console.log(`🚨 Alert stored: ${data.alert} (ID: ${alert._id})`);

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