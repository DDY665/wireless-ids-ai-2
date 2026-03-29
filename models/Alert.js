const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  source_mac: {
    type: String,
    default: "Unknown"
  },
  dest_mac: {
    type: String,
    default: "Unknown"
  },
  bssid: {
    type: String,
    default: "Unknown"
  },
  channel: {
    type: Number,
    default: null,
    index: true
  },
  frequency: {
    type: Number,
    default: null
  },
  signal: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    enum: ["kismet", "simulated", "manual"],
    default: "kismet"
  },
  severityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  severityLevel: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "low",
    index: true
  },
  status: {
    type: String,
    enum: ["new", "triaged", "investigating", "resolved", "false_positive"],
    default: "new",
    index: true
  },
  analystNotes: {
    type: String,
    default: ""
  },
  firstSeen: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  occurrenceCount: {
    type: Number,
    min: 1,
    default: 1
  },

  mitre: {
    technique_id: {
      type: String,
      default: "Unknown"
    },
    tactic: {
      type: String,
      default: "unknown"
    },
    name: {
      type: String,
      default: "Unknown"
    },
    description: {
      type: String,
      default: "No description available."
    }
  },

  explanation: {
    type: String,
    default: ""
  },

  // Correlation tracking
  correlationId: {
    type: String,
    index: true,
    default: null
  },
  correlationCount: {
    type: Number,
    min: 1,
    default: 1
  }
}, {
  timestamps: true
});

AlertSchema.index({ type: 1, timestamp: -1 });
AlertSchema.index({ severityLevel: 1, timestamp: -1 });
AlertSchema.index({ "mitre.technique_id": 1 });

module.exports = mongoose.model("Alert", AlertSchema);