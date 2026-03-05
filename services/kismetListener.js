import WebSocket from "ws";
import Alert from "../models/Alert.js";
import { mapToMitre } from "./mitreService.js";

export function startKismetListener(io) {

  const ws = new WebSocket("ws://localhost:2501/alerts/alerts.ws");

  ws.on("open", () => {
    console.log("Connected to Kismet Alerts API");
  });

  ws.on("error", (err) => {
  console.log("Kismet not running yet. Waiting for sensor...");
});

  ws.on("message", async (msg) => {
    try {

      const data = JSON.parse(msg.toString());

      const mitre = mapToMitre(data.alert);

      const alert = await Alert.create({
        type: data.alert,
        source_mac: data.source_mac,
        dest_mac: data.dest_mac,
        bssid: data.bssid,
        signal: data.signal,
        timestamp: new Date(),
        mitre
      });

      io.emit("new-alert", alert);

      console.log("Alert stored:", data.alert);

    } catch (err) {
      console.error("Error processing alert:", err);
    }
  });

}