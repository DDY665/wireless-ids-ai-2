import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mitrePath = path.join(__dirname, "../mitre/enterprise-attack.json");

let mitreData = null;

// Load MITRE data with error handling
try {
  const fileContent = fs.readFileSync(mitrePath, "utf8");
  mitreData = JSON.parse(fileContent);
  console.log("✅ MITRE ATT&CK data loaded successfully");
} catch (err) {
  console.error("❌ Failed to load MITRE ATT&CK data:", err.message);
  mitreData = { objects: [] }; // Fallback to empty
}

// Mapping of alert types to MITRE techniques
const map = {
  DEAUTHFLOOD: "T1499",      // Endpoint Denial of Service
  SSIDCONFLICT: "T1557",     // Man-in-the-Middle
  MACCONFLICT: "T1036",      // Masquerading
  BEACONFLOOD: "T1498",      // Network Denial of Service
  DISASSOCFLOOD: "T1499",    // Endpoint Denial of Service
  PROBERESP: "T1046",        // Network Service Discovery
  CRYPTODROP: "T1562",       // Impair Defenses
  NULLPROBERESP: "T1040"     // Network Sniffing
};

export function mapToMitre(alertType) {
  try {
    if (!alertType) {
      console.warn("⚠️  No alert type provided for MITRE mapping");
      return null;
    }

    const technique = map[alertType];

    if (!technique) {
      console.warn(`⚠️  No MITRE mapping found for alert type: ${alertType}`);
      return {
        technique_id: "Unknown",
        name: alertType,
        description: "No MITRE mapping available for this alert type.",
        tactic: "unknown"
      };
    }

    if (!mitreData || !mitreData.objects) {
      console.error("❌ MITRE data not loaded");
      return {
        technique_id: technique,
        name: alertType,
        description: "MITRE data unavailable.",
        tactic: "unknown"
      };
    }

    const obj = mitreData.objects.find(o =>
      o.external_references?.some(ref => ref.external_id === technique)
    );

    if (!obj) {
      console.warn(`⚠️  MITRE technique ${technique} not found in dataset`);
      return {
        technique_id: technique,
        name: alertType,
        description: "MITRE technique details unavailable.",
        tactic: "unknown"
      };
    }

    return {
      technique_id: technique,
      name: obj.name || alertType,
      description: obj.description || "No description available.",
      tactic: obj.kill_chain_phases?.[0]?.phase_name || "unknown"
    };

  } catch (err) {
    console.error("❌ Error in MITRE mapping:", err.message);
    return {
      technique_id: "Error",
      name: alertType || "Unknown",
      description: "Error mapping to MITRE framework.",
      tactic: "unknown"
    };
  }
}

// Get all available mappings
export function getAvailableMappings() {
  return Object.keys(map);
}