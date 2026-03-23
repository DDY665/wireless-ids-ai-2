import mongoose from "mongoose";

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
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  confidenceLabel: {
    type: String,
    enum: ["high", "medium", "low", null],
    default: null
  },
  verificationStatus: {
    type: String,
    enum: ["verified", "partially_verified", "unverified", null],
    default: null
  },
  needsAnalystValidation: {
    type: Boolean,
    default: false
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

export default mongoose.model("Conversation", ConversationSchema);
