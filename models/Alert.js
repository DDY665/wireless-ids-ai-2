import mongoose from "mongoose";

const AlertSchema = new mongoose.Schema({
  type: String,
  source_mac: String,
  dest_mac: String,
  bssid: String,
  signal: Number,
  timestamp: Date,

  mitre: {
    technique_id: String,
    tactic: String,
    name: String,
    description: String
  },

  explanation: String
});

export default mongoose.model("Alert", AlertSchema);