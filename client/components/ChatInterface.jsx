import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { withSecurityHeaders } from "../src/apiSecurity";
import "./chat-interface.css";

function ChatInterface({ alertId = null, alertContext = null }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const buildWelcomeMessage = useCallback(() => {
    if (alertId && alertContext) {
      return `Hello! I am your cybersecurity assistant. I can help you understand the **${alertContext.type}** alert and plan mitigation.`;
    }

    return "Hello! I am your cybersecurity assistant. Ask me about wireless security, detection, and mitigation.";
  }, [alertId, alertContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const welcomeMsg = {
        role: "assistant",
        content: buildWelcomeMessage(),
        timestamp: new Date()
      };

      if (!alertId) {
        setMessages([welcomeMsg]);
        return;
      }

      try {
        const res = await fetch(`http://localhost:5000/ai/chat-history/${alertId}`, {
          headers: withSecurityHeaders(),
          signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
          throw new Error(`Failed to load history (${res.status})`);
        }

        const data = await res.json();
        const historyMessages = Array.isArray(data.messages)
          ? data.messages
            .filter((msg) => msg?.role === "user" || msg?.role === "assistant")
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
            }))
          : [];

        if (!cancelled) {
          setMessages(historyMessages.length ? historyMessages : [welcomeMsg]);
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
        if (!cancelled) {
          setMessages([welcomeMsg]);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [alertId, alertContext, buildWelcomeMessage]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = {
      role: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      }));

      const res = await fetch("http://localhost:5000/ai/chat", {
        method: "POST",
        headers: withSecurityHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          message: input,
          history,
          alertId,
          includeAnalysis: false
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      const aiMsg = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Could not connect to AI service. ${err.message}`,
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!alertId) return;
    if (!window.confirm("Clear all conversation history for this alert?")) return;

    try {
      const res = await fetch(`http://localhost:5000/ai/chat-history/${alertId}`, {
        method: "DELETE",
        headers: withSecurityHeaders()
      });
      if (!res.ok) {
        throw new Error("Failed to clear history");
      }
      setMessages([
        {
          role: "assistant",
          content: buildWelcomeMessage(),
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear conversation history");
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-root">
      {alertContext ? (
        <div className="chat-context">
          <div className="chat-context-title">Current Alert Context</div>
          <div className="chat-context-row">
            <span className="chat-chip">{alertContext.type}</span>
            <span className="chat-chip chat-chip-muted">Signal: {alertContext.signal} dBm</span>
            {alertContext.mitre ? (
              <span className="chat-chip chat-chip-mitre">
                {alertContext.mitre.technique_id}: {alertContext.mitre.name}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="chat-head">
        <div>
          <div className="chat-head-title">Analyst Chat</div>
          <div className="chat-head-sub">{messages.length} messages</div>
        </div>
        <button className="chat-clear" onClick={clearHistory} disabled={messages.length === 0 || loading} type="button">
          Clear
        </button>
      </div>

      <div className="chat-window">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-row ${msg.role === "user" ? "is-user" : "is-ai"}`}
          >
            <div className={`chat-bubble ${msg.isError ? "is-error" : ""}`}>
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: "0.45em 0" }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ marginLeft: "1.1em" }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ marginLeft: "1.1em" }}>{children}</ol>
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <div>{msg.content}</div>
              )}

              <div className="chat-time">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {loading ? (
          <div className="chat-row is-ai">
            <div className="chat-bubble chat-loading">Analyzing...</div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          rows={2}
          disabled={loading}
          placeholder="Ask what happened, why it matters, and what to do next..."
        />
        <button className="chat-send" onClick={sendMessage} disabled={loading || !input.trim()} type="button">
          {loading ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default ChatInterface;
