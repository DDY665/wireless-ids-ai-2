import express from "express";
import Alert from "../models/Alert.js";
import Conversation from "../models/Conversation.js";
import Groq from "groq-sdk";
import mongoose from "mongoose";
import { verifyResponseTruth } from "../services/truthVerifier.js";
import { requireApiKey } from "../middleware/auth.js";

const router = express.Router();

let groqClient = null;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY_MISSING");
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

  return groqClient;
}

/*
Helper: Validate MongoDB ObjectId
*/
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/*
Helper: Call Groq API with timeout and error handling
*/
async function callGroqWithTimeout(messages, timeoutMs = 30000) {
  const groq = getGroqClient();

  const completionPromise = groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("AI request timed out")), timeoutMs);
  });

  const completion = await Promise.race([completionPromise, timeoutPromise]);
  return completion.choices[0].message.content;
}

function parseStructuredReply(rawText) {
  const fallback = {
    answer: String(rawText || "").trim() || "I could not generate a valid response.",
    claims: [],
    unknowns: ["Response not returned in expected structure"]
  };

  try {
    const cleaned = String(rawText || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      answer: String(parsed.answer || "").trim() || fallback.answer,
      claims: Array.isArray(parsed.claims)
        ? parsed.claims.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      unknowns: Array.isArray(parsed.unknowns)
        ? parsed.unknowns.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
        : []
    };
  } catch {
    return fallback;
  }
}

function getLowConfidenceThreshold() {
  const parsed = Number.parseFloat(process.env.TRUTH_CONFIDENCE_LOW || "0.55");
  if (!Number.isFinite(parsed)) {
    return 0.55;
  }
  return Math.max(0, Math.min(1, parsed));
}

function buildLowConfidenceSafeReply(alertContext, structured, originalMessage) {
  const knownFacts = [
    alertContext?.type ? `Attack Type: ${alertContext.type}` : null,
    alertContext?.signal !== undefined ? `Signal: ${alertContext.signal} dBm` : null,
    alertContext?.mitre?.technique_id ? `MITRE Technique: ${alertContext.mitre.technique_id}` : null,
    alertContext?.mitre?.name ? `MITRE Name: ${alertContext.mitre.name}` : null
  ].filter(Boolean);

  const unknowns = [
    ...(Array.isArray(structured.unknowns) ? structured.unknowns : []),
    "Confidence is currently low for a definitive answer.",
    "Please validate this interpretation with additional packet/context analysis."
  ];

  const answer = [
    "I cannot provide a definitive answer with high confidence for this question yet.",
    "",
    "Known facts from current alert context:",
    ...knownFacts.map((fact) => `- ${fact}`),
    "",
    "Recommended verification steps:",
    "- Correlate this alert with nearby alerts in the same time window.",
    "- Validate packet-level indicators in Kismet/Wireshark.",
    "- Confirm whether the behavior is expected in your environment.",
    "",
    `Original question: ${originalMessage}`
  ].join("\n");

  return {
    answer,
    claims: knownFacts,
    unknowns
  };
}

async function persistConversationMessage(alertId, userMessage, assistantMessage, assistantMeta = {}) {
  if (!alertId) return null;

  const now = new Date();
  const update = {
    $push: {
      messages: {
        $each: [
          { role: "user", content: userMessage, timestamp: now },
          {
            role: "assistant",
            content: assistantMessage,
            claims: assistantMeta.claims || [],
            unknowns: assistantMeta.unknowns || [],
            evidence: assistantMeta.evidence || [],
            confidenceScore: typeof assistantMeta.confidenceScore === "number" ? assistantMeta.confidenceScore : null,
            confidenceLabel: assistantMeta.confidenceLabel || null,
            verificationStatus: assistantMeta.verificationStatus || null,
            needsAnalystValidation: Boolean(assistantMeta.needsAnalystValidation),
            timestamp: now
          }
        ],
        $slice: -100
      }
    },
    $set: {
      lastMessageAt: now
    },
    $inc: {
      messageCount: 2
    }
  };

  return Conversation.findOneAndUpdate(
    { alertId },
    update,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}


/*
------------------------------------------------
1️⃣  UNIFIED CHAT ENDPOINT
POST /ai/chat
------------------------------------------------
Supports conversation history and general questions
*/

router.post("/chat", requireApiKey, async (req, res) => {
  try {
    const { message, history = [], alertId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: "Valid message is required"
      });
    }

    // Build context from alert if provided
    let systemPrompt = "You are a helpful cybersecurity assistant specializing in wireless network security and intrusion detection. Provide clear, accurate, and educational responses.";
    let contextInfo = "";
    let alertContext = null;

    if (alertId) {
      if (!isValidObjectId(alertId)) {
        return res.status(400).json({ error: "Invalid alert ID format" });
      }

      alertContext = await Alert.findById(alertId).lean();
      if (alertContext) {
        contextInfo = `

Current Alert Context:
- Attack Type: ${alertContext.type}
- Signal Strength: ${alertContext.signal} dBm
- MITRE Technique: ${alertContext.mitre?.technique_id} - ${alertContext.mitre?.name}
- Description: ${alertContext.mitre?.description || 'N/A'}
- Timestamp: ${alertContext.timestamp}
`;
      }
    }

    const structuredOutputInstruction = `

Response Policy:
- Be precise and avoid speculation.
- If evidence is insufficient, explicitly say it in unknowns.
- Return strict JSON only (no markdown, no code block) using this schema:
  {
    "answer": "string",
    "claims": ["string"],
    "unknowns": ["string"]
  }
`;

    // Build message history
    const messages = [
      { role: "system", content: systemPrompt + contextInfo + structuredOutputInstruction }
    ];

    // Add conversation history (limit to last 10 messages)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content || msg.text
        });
      }
    }

    // Add current user message
    messages.push({
      role: "user",
      content: message
    });

    const rawReply = await callGroqWithTimeout(messages);
    let structured = parseStructuredReply(rawReply);
    let truth = verifyResponseTruth({
      answer: structured.answer,
      claims: structured.claims,
      alert: alertContext
    });

    const lowConfidenceThreshold = getLowConfidenceThreshold();
    if (truth.confidenceScore <= lowConfidenceThreshold) {
      structured = buildLowConfidenceSafeReply(alertContext, structured, message);
      truth = verifyResponseTruth({
        answer: structured.answer,
        claims: structured.claims,
        alert: alertContext
      });
      truth.needsAnalystValidation = true;
    }

    let conversation = null;
    if (alertId) {
      conversation = await persistConversationMessage(alertId, message, structured.answer, {
        ...truth,
        claims: structured.claims,
        unknowns: structured.unknowns
      });
    }

    res.json({
      reply: structured.answer,
      alertId: alertId || null,
      conversationId: conversation?._id || null,
      messageCount: conversation?.messageCount || null,
      truth: {
        confidenceScore: truth.confidenceScore,
        confidenceLabel: truth.confidenceLabel,
        verificationStatus: truth.verificationStatus,
        needsAnalystValidation: truth.needsAnalystValidation,
        claims: structured.claims,
        unknowns: structured.unknowns,
        evidence: truth.evidence,
        contradictions: truth.contradictions,
        thresholds: truth.thresholds,
        lowConfidenceThreshold
      }
    });

  } catch (err) {
    console.error("Chat Error:", err);

    // Handle specific error types
    if (err.message === "AI request timed out") {
      return res.status(504).json({
        error: "AI service timed out. Please try again."
      });
    }

    if (err.message === "GROQ_API_KEY_MISSING" || err.message?.includes("API key")) {
      return res.status(503).json({
        error: "AI service configuration error"
      });
    }

    res.status(500).json({
      error: "Failed to process chat message",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/*
------------------------------------------------
2️⃣  CHAT HISTORY ENDPOINT
GET /ai/chat-history/:alertId
------------------------------------------------
*/

router.get("/chat-history/:alertId", requireApiKey, async (req, res) => {
  try {
    const { alertId } = req.params;

    if (!isValidObjectId(alertId)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const conversation = await Conversation.findOne({ alertId }).lean();

    if (!conversation) {
      return res.json({
        alertId,
        messages: [],
        messageCount: 0
      });
    }

    return res.json({
      conversationId: conversation._id,
      alertId,
      messages: conversation.messages || [],
      messageCount: conversation.messageCount || 0,
      lastMessageAt: conversation.lastMessageAt || null
    });
  } catch (err) {
    console.error("Chat history fetch error:", err);
    return res.status(500).json({
      error: "Failed to fetch chat history",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

/*
------------------------------------------------
3️⃣  CLEAR CHAT HISTORY ENDPOINT
DELETE /ai/chat-history/:alertId
------------------------------------------------
*/

router.delete("/chat-history/:alertId", requireApiKey, async (req, res) => {
  try {
    const { alertId } = req.params;

    if (!isValidObjectId(alertId)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const result = await Conversation.deleteOne({ alertId });
    return res.json({
      success: true,
      deletedCount: result.deletedCount || 0
    });
  } catch (err) {
    console.error("Chat history deletion error:", err);
    return res.status(500).json({
      error: "Failed to clear chat history",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});


/*
------------------------------------------------
4️⃣  EXPLAIN ATTACK ENDPOINT
GET /ai/explain/:id
------------------------------------------------
*/

router.get("/explain/:id", requireApiKey, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const prompt = `
You are a cybersecurity instructor.

Explain this wireless attack in simple language.

Alert Type: ${alert.type}
Signal Strength: ${alert.signal}

MITRE Technique: ${alert.mitre?.technique_id || 'Unknown'}
Technique Name: ${alert.mitre?.name || 'Unknown'}

Description:
${alert.mitre?.description || 'No description available'}

Explain clearly:
1. What the attack means
2. Why attackers use it
3. What impact it causes
4. How to detect and prevent it
`;

    const explanation = await callGroqWithTimeout([
      { role: "system", content: "Explain cybersecurity concepts clearly and educationally." },
      { role: "user", content: prompt }
    ]);

    res.json({
      alertId: alert._id,
      explanation
    });

  } catch (err) {
    console.error("Explain Error:", err);

    if (err.message === "AI request timed out") {
      return res.status(504).json({
        error: "AI service timed out. Please try again."
      });
    }

    if (err.message === "GROQ_API_KEY_MISSING") {
      return res.status(503).json({
        error: "AI service configuration error"
      });
    }

    res.status(500).json({
      error: "Failed to generate explanation",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


/*
------------------------------------------------
5️⃣  LEGACY CHAT ENDPOINT (deprecated)
POST /ai/chat/:id
------------------------------------------------
*/

router.post("/chat/:id", requireApiKey, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid alert ID format" });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const systemPrompt = `You are a cybersecurity expert assisting a network analyst.

Alert Context:
Attack Type: ${alert.type}
Signal Strength: ${alert.signal}
MITRE Technique: ${alert.mitre?.technique_id} - ${alert.mitre?.name}
Description: ${alert.mitre?.description}`;

    const reply = await callGroqWithTimeout([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    res.json({
      alertId: alert._id,
      reply
    });

  } catch (err) {
    console.error("Chat Error:", err);

    if (err.message === "AI request timed out") {
      return res.status(504).json({
        error: "AI service timed out. Please try again."
      });
    }

    if (err.message === "GROQ_API_KEY_MISSING") {
      return res.status(503).json({
        error: "AI service configuration error"
      });
    }

    res.status(500).json({
      error: "AI chat failed",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


export default router;