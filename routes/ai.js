import express from "express";
import Alert from "../models/Alert.js";
import Groq from "groq-sdk";

const router = express.Router();

router.get("/explain/:id", async (req, res) => {

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

Explain:
1. What the attack means
2. Why attackers use it
3. What impact it causes
`;

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });

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

});

export default router;