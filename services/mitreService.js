import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mitrePath = path.join(__dirname, "../mitre/enterprise-attack.json");

const mitreData = JSON.parse(fs.readFileSync(mitrePath, "utf8"));

const map = {
  DEAUTHFLOOD: "T1499",
  SSIDCONFLICT: "T1557",
  MACCONFLICT: "T1036",
  BEACONFLOOD: "T1498"
};

export function mapToMitre(alertType) {

  const technique = map[alertType];

  if (!technique) return null;

  const obj = mitreData.objects.find(o =>
    o.external_references?.some(ref => ref.external_id === technique)
  );

  if (!obj) return null;

  return {
    technique_id: technique,
    name: obj.name,
    description: obj.description,
    tactic: obj.kill_chain_phases?.[0]?.phase_name || ""
  };

}