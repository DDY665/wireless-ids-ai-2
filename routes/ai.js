import express from "express";
import Alert from "../models/Alert.js";
import Groq from "groq-sdk";

const router = express.Router();

/*
Initialize Groq client once
*/
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});


/*
------------------------------------------------
1️⃣  EXPLAIN ATTACK ENDPOINT
GET /ai/explain/:id
------------------------------------------------
*/

router.get("/explain/:id", async (req, res) => {

  try {

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const prompt = `
You are a cybersecurity instructor.

Explain this wireless attack in simple language.

Alert Type: ${alert.type}
Signal Strength: ${alert.signal}

MITRE Technique: ${alert.mitre.technique_id}
Technique Name: ${alert.mitre.name}

Description:
${alert.mitre.description}

Explain clearly:
1. What the attack means
2. Why attackers use it
3. What impact it causes
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "Explain cybersecurity concepts clearly." },
        { role: "user", content: prompt }
      ]
    });

    const explanation = completion.choices[0].message.content;

    res.json({
      alertId: alert._id,
      explanation
    });

  } catch (err) {

    console.error("Explain Error:", err);

    res.status(500).json({
      error: "Failed to generate explanation"
    });

  }

});


/*
------------------------------------------------
2️⃣  CHAT ABOUT ATTACK
POST /ai/chat/:id
------------------------------------------------
User can ask follow-up questions
*/

router.post("/chat/:id", async (req, res) => {

  try {

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const prompt = `
You are a cybersecurity expert assisting a network analyst.

Alert Context:
Attack Type: ${alert.type}
Signal Strength: ${alert.signal}

MITRE Technique: ${alert.mitre.technique_id}
Technique Name: ${alert.mitre.name}
Description: ${alert.mitre.description}

User Question:
${message}

Provide a clear and concise cybersecurity explanation.
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a helpful cybersecurity assistant." },
        { role: "user", content: prompt }
      ]
    });

    const reply = completion.choices[0].message.content;

    res.json({
      alertId: alert._id,
      reply
    });

  } catch (err) {

    console.error("Chat Error:", err);

    res.status(500).json({
      error: "AI chat failed"
    });

  }

});


export default router;