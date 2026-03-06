import { useState } from "react";

function AlertChat({ alertId }) {

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {

    if (!input.trim()) return;

    const userMsg = { role: "user", text: input };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {

      const res = await fetch(`http://localhost:5000/ai/chat/${alertId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: input })
      });

      const data = await res.json();

      const aiMsg = { role: "ai", text: data.reply };

      setMessages(prev => [...prev, aiMsg]);

    } catch (err) {

      console.error(err);

      setMessages(prev => [
        ...prev,
        { role: "ai", text: "AI service unavailable." }
      ]);

    }

    setInput("");
    setLoading(false);
  };

  return (
    <div style={{
      borderTop: "1px solid #333",
      marginTop: "12px",
      paddingTop: "12px"
    }}>

      {/* Chat Window */}
      <div style={{
        height: "200px",
        overflowY: "auto",
        background: "#1e1e1e",
        padding: "10px",
        marginBottom: "10px",
        color: "#e5e5e5",
        borderRadius: "6px",
        fontSize: "14px"
      }}>

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              textAlign: msg.role === "user" ? "right" : "left",
              marginBottom: "8px",
              color: msg.role === "user" ? "#4fc3f7" : "#e5e5e5"
            }}
          >
            <b>{msg.role === "user" ? "You" : "AI"}:</b> {msg.text}
          </div>
        ))}

        {loading && <p style={{ color: "#aaa" }}>AI thinking...</p>}

      </div>

      {/* Input Area */}
      <div style={{
        display: "flex",
        gap: "6px"
      }}>

        <input
          style={{
            flex: 1,
            background: "#2a2a2a",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: "4px",
            padding: "6px"
          }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this attack..."
        />

        <button
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "4px",
            padding: "6px 12px",
            cursor: "pointer"
          }}
          onClick={sendMessage}
        >
          Send
        </button>

      </div>

    </div>
  );
}

export default AlertChat;