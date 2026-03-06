import express from "express";
import Alert from "../models/Alert.js";
import Groq from "groq-sdk";
import mongoose from "mongoose";

const router = express.Router();

/*
Initialize Groq client with validation
*/
if (!process.env.GROQ_API_KEY) {
  console.error("⚠️  GROQ_API_KEY not found in environment variables");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy-key"
});

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    clearTimeout(timeout);
    return completion.choices[0].message.content;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error("AI request timed out");
    }
    throw err;
  }
}


/*
------------------------------------------------
1️⃣  UNIFIED CHAT ENDPOINT
POST /ai/chat
------------------------------------------------
Supports conversation history and general questions
*/

router.post("/chat", async (req, res) => {
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

    if (alertId) {
      if (!isValidObjectId(alertId)) {
        return res.status(400).json({ error: "Invalid alert ID format" });
      }

      const alert = await Alert.findById(alertId);
      if (alert) {
        contextInfo = `

Current Alert Context:
- Attack Type: ${alert.type}
- Signal Strength: ${alert.signal} dBm
- MITRE Technique: ${alert.mitre?.technique_id} - ${alert.mitre?.name}
- Description: ${alert.mitre?.description || 'N/A'}
- Timestamp: ${alert.timestamp}
`;
      }
    }

    // Build message history
    const messages = [
      { role: "system", content: systemPrompt + contextInfo }
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

    const reply = await callGroqWithTimeout(messages);

    res.json({
      reply,
      alertId: alertId || null
    });

  } catch (err) {
    console.error("Chat Error:", err);

    // Handle specific error types
    if (err.message === "AI request timed out") {
      return res.status(504).json({
        error: "AI service timed out. Please try again."
      });
    }

    if (err.message?.includes("API key")) {
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
2️⃣  EXPLAIN ATTACK ENDPOINT
GET /ai/explain/:id
------------------------------------------------
*/

router.get("/explain/:id", async (req, res) => {
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

    res.status(500).json({
      error: "Failed to generate explanation",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


/*
------------------------------------------------
3️⃣  LEGACY CHAT ENDPOINT (deprecated)
POST /ai/chat/:id
------------------------------------------------
*/

router.post("/chat/:id", async (req, res) => {
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

    res.status(500).json({
      error: "AI chat failed",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});


export default router;