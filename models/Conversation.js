const mongoose = require("mongoose");

const ConversationMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["system", "user", "assistant"],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  claims: {
    type: [String],
    default: []
  },
  unknowns: {
    type: [String],
    default: []
  },
  evidence: {
    type: [String],
    default: []
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Alert",
    required: true,
    index: true
  },
  messages: {
    type: [ConversationMessageSchema],
    default: []
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

ConversationSchema.index({ alertId: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
