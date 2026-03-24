import express from "express";
import Alert from "../models/Alert.js";
import Conversation from "../models/Conversation.js";
import Groq from "groq-sdk";
import mongoose from "mongoose";
import { requireApiKey } from "../middleware/auth.js";

const router = express.Router();

let groqClient = null;
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const FALLBACK_GROQ_MODEL = "llama-3.1-8b-instant";

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
async function callGroqWithTimeout(messages, timeoutMs = 30000, options = {}) {
  const groq = getGroqClient();
  const { expectJson = false, temperature = 0.35, maxTokens = 1800 } = options;

  const modelCandidates = [DEFAULT_GROQ_MODEL, FALLBACK_GROQ_MODEL]
    .map((model) => String(model || "").trim())
    .filter(Boolean)
    .filter((model, index, arr) => arr.indexOf(model) === index);

  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const completionPromise = groq.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(expectJson ? { response_format: { type: "json_object" } } : {})
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("AI request timed out")), timeoutMs);
      });

      const completion = await Promise.race([completionPromise, timeoutPromise]);
      return completion.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastError = err;
      const message = String(err?.message || "").toLowerCase();
      const canFallback = message.includes("model") || message.includes("not found") || message.includes("unsupported");
      if (!canFallback || model === modelCandidates[modelCandidates.length - 1]) {
        throw err;
      }
    }
  }

  throw lastError || new Error("AI request failed");
}

function parseStructuredReply(rawText) {
  const fallback = {
    answer: String(rawText || "").trim() || "I could not generate a valid response.",
    claims: [],
    evidence: [],
    unknowns: ["Response not returned in expected structure"]
  };

  try {
    const cleaned = String(rawText || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const jsonCandidate = firstBrace >= 0 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

    const parsed = JSON.parse(jsonCandidate);

    return {
      answer: String(parsed.answer || "").trim() || fallback.answer,
      claims: Array.isArray(parsed.claims)
        ? parsed.claims.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      unknowns: Array.isArray(parsed.unknowns)
        ? parsed.unknowns.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
        : []
    };
  } catch {
    return fallback;
  }
}

function sanitizeHistory(history = []) {
  const welcomePatterns = [
    "hello! i'm your cybersecurity assistant",
    "ask me about wireless security"
  ];

  const sanitized = history
    .filter((msg) => msg?.role === "user" || msg?.role === "assistant")
    .map((msg) => ({
      role: msg.role,
      content: String(msg.content || msg.text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200)
    }))
    .filter((msg) => msg.content)
    .filter((msg) => {
      if (msg.role !== "assistant") return true;
      const lowered = msg.content.toLowerCase();
      return !welcomePatterns.some((pattern) => lowered.includes(pattern));
    });

  const deduped = [];
  for (const msg of sanitized) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.role === msg.role && prev.content === msg.content) {
      continue;
    }
    deduped.push(msg);
  }

  return deduped.slice(-6);
}

function isLikelyFollowUp(message) {
  const text = String(message || "").toLowerCase().trim();
  if (!text) return false;

  const directKeywords = [
    "that",
    "this",
    "it",
    "why",
    "how",
    "more",
    "elaborate",
    "explain",
    "what about",
    "and then",
    "next",
    "second",
    "first"
  ];

  if (text.length <= 40) return true;
  return directKeywords.some((keyword) => text.includes(keyword));
}

function buildQuestionWithContext(message, recentHistory = []) {
  const userMessage = String(message || "").trim();
  if (!userMessage) return "";

  if (!isLikelyFollowUp(userMessage) || recentHistory.length === 0) {
    return userMessage;
  }

  const lastUser = [...recentHistory].reverse().find((m) => m.role === "user")?.content || "";
  const lastAssistant = [...recentHistory].reverse().find((m) => m.role === "assistant")?.content || "";

  if (!lastUser && !lastAssistant) return userMessage;

  const reference = [
    lastUser ? `Previous user question: ${lastUser.slice(0, 300)}` : "",
    lastAssistant ? `Previous assistant answer: ${lastAssistant.slice(0, 500)}` : ""
  ].filter(Boolean).join("\n");

  return `Follow-up context:\n${reference}\n\nCurrent user question: ${userMessage}`;
}

function isWeakAnswer(structured = {}) {
  const answer = String(structured.answer || "").trim();
  const lowInfoPatterns = [
    "i could not generate a valid response",
    "i don't have enough information",
    "not enough information",
    "cannot determine",
    "insufficient context"
  ];

  if (answer.length < 120) return true;
  return lowInfoPatterns.some((p) => answer.toLowerCase().includes(p));
}

function needsActionPlan(message) {
  const text = String(message || "").toLowerCase();
  const actionKeywords = [
    "what should i do",
    "what do i do",
    "next",
    "steps",
    "immediate",
    "minutes",
    "action plan",
    "triage"
  ];
  return actionKeywords.some((keyword) => text.includes(keyword));
}

function hasActionPlanHeadings(answer) {
  const text = String(answer || "").toLowerCase();
  return text.includes("immediate actions")
    && text.includes("what to verify first")
    && text.includes("next defensive step");
}

function buildActionPlanFallback(structured, alertContext) {
  const attackType = alertContext?.type || "wireless attack";
  const signal = Number.isFinite(alertContext?.signal) ? `${alertContext.signal} dBm` : "unknown signal";
  const evidence = Array.isArray(structured?.evidence) ? structured.evidence.slice(0, 2) : [];
  const unknowns = Array.isArray(structured?.unknowns) ? structured.unknowns.slice(0, 2) : [];

  const evidenceLine = evidence.length
    ? `Check corroborating data from ${evidence.join(" and ")}.`
    : "Check AP/controller event logs and monitor-mode packet capture for corroboration.";

  const unknownLine = unknowns.length
    ? `Validate unknowns first: ${unknowns.join("; ")}.`
    : "Validate source MAC, transmitter location, and whether clients are actually disconnecting.";

  return [
    "Immediate Actions (0-10 min)",
    `1. Confirm whether the ${attackType} alert at ${signal} is active right now by checking fresh deauth/disassoc frames in the wireless controller logs.`,
    "2. Start a short packet capture on the affected channel and identify top transmitter MACs and frame rate.",
    "3. Contain impact by steering clients to alternate AP/channel and increasing monitoring on the affected SSID.",
    "",
    "What to Verify First",
    `- ${evidenceLine}`,
    `- ${unknownLine}`,
    "- Verify if affected clients share one AP, one channel, or one BSSID to narrow blast radius.",
    "",
    "Next Defensive Step",
    "- If malicious traffic is confirmed, add temporary AP-side mitigation (frame protection/WIDS policy), block offender MACs where supported, and escalate incident triage with captured evidence."
  ].join("\n");
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
    const { message, history = [], alertId, includeAnalysis = false } = req.body;
    const shouldIncludeAnalysis = includeAnalysis === true || String(includeAnalysis).toLowerCase() === "true";

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: "Valid message is required"
      });
    }

    // Build context from alert if provided
    let systemPrompt = "You are a senior wireless cybersecurity analyst assistant. Answer only the latest user question first, with concrete and operational detail. Avoid generic boilerplate and avoid repeating prior wording unless the user requests a recap.";
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
- Start with a direct answer in 3-6 sentences focused on the latest user request.
- If this is a follow-up, provide delta information instead of repeating previous explanations.
- Include practical details: what to check, why it matters, and what action to take next.
- Prefer exact alert context over general theory when alert data is available.
- If evidence is insufficient, state uncertainty in unknowns and suggest exactly what to validate next.
- For action-oriented questions, format answer with these headings in plain text:
  1) Immediate Actions (0-10 min)
  2) What to Verify First
  3) Next Defensive Step
- Return strict JSON only (no markdown, no code block) using this schema:
  {
    "answer": "string",
    "claims": ["string"],
    "evidence": ["string"],
    "unknowns": ["string"]
  }
`;

    // Build message history
    const recentHistory = sanitizeHistory(history);
    const focusedQuestion = buildQuestionWithContext(message, recentHistory);

    const messages = [
      { role: "system", content: systemPrompt + contextInfo + structuredOutputInstruction }
    ];

    // Add recent conversation history
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add current user message
    messages.push({
      role: "user",
      content: focusedQuestion
    });

    const rawReply = await callGroqWithTimeout(messages, 30000, {
      expectJson: true,
      temperature: 0.3,
      maxTokens: 1800
    });
    let structured = parseStructuredReply(rawReply);
    const actionPlanRequired = needsActionPlan(message);
    const lacksStructure = actionPlanRequired && !hasActionPlanHeadings(structured.answer);

    // One repair attempt if answer came back weak/underspecified.
    if (isWeakAnswer(structured) || lacksStructure) {
      const retryMessages = [
        ...messages,
        {
          role: "system",
          content: actionPlanRequired
            ? "Your previous answer was too generic. Regenerate with concrete, step-by-step triage actions and include the exact headings: Immediate Actions (0-10 min), What to Verify First, Next Defensive Step. Return strict JSON only."
            : "Your previous answer was too generic or too short. Regenerate with concrete, actionable detail tied to the alert context. Return strict JSON only using the required schema."
        }
      ];

      const retryRaw = await callGroqWithTimeout(retryMessages, 30000, {
        expectJson: true,
        temperature: 0.25,
        maxTokens: 1800
      });

      const retried = parseStructuredReply(retryRaw);
      const retriedLacksStructure = actionPlanRequired && !hasActionPlanHeadings(retried.answer);
      if (!isWeakAnswer(retried) && !retriedLacksStructure) {
        structured = retried;
      }
    }

    if (actionPlanRequired && !hasActionPlanHeadings(structured.answer)) {
      structured.answer = buildActionPlanFallback(structured, alertContext);
    }

    let conversation = null;
    if (alertId) {
      conversation = await persistConversationMessage(alertId, message, structured.answer, {
        claims: shouldIncludeAnalysis ? structured.claims : [],
        unknowns: shouldIncludeAnalysis ? structured.unknowns : [],
        evidence: shouldIncludeAnalysis ? structured.evidence : []
      });
    }

    const responsePayload = {
      reply: structured.answer,
      alertId: alertId || null,
      conversationId: conversation?._id || null,
      messageCount: conversation?.messageCount || null
    };

    if (shouldIncludeAnalysis) {
      responsePayload.analysis = {
        claims: structured.claims,
        unknowns: structured.unknowns,
        evidence: structured.evidence
      };
    }

    res.json(responsePayload);

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
    ], 30000, {
      expectJson: false,
      temperature: 0.4,
      maxTokens: 1200
    });

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
    ], 30000, {
      expectJson: false,
      temperature: 0.4,
      maxTokens: 1200
    });

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