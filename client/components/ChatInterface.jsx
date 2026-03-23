import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { withSecurityHeaders } from "../src/apiSecurity";

function ChatInterface({ alertId = null, alertContext = null }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const buildWelcomeMessage = () => {
    if (alertId && alertContext) {
      return `Hello! I'm your cybersecurity assistant. I can help you understand the **${alertContext.type}** attack detected. Ask me anything!`;
    }

    return "Hello! I'm your cybersecurity assistant. Ask me about wireless security, intrusion detection, or any security questions you have!";
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load persisted conversation for selected alert; fallback to welcome message.
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
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              claims: Array.isArray(msg.claims) ? msg.claims : [],
              unknowns: Array.isArray(msg.unknowns) ? msg.unknowns : [],
              evidence: Array.isArray(msg.evidence) ? msg.evidence : [],
              confidenceScore: typeof msg.confidenceScore === "number" ? msg.confidenceScore : null,
              confidenceLabel: msg.confidenceLabel || null,
              verificationStatus: msg.verificationStatus || null,
              needsAnalystValidation: Boolean(msg.needsAnalystValidation)
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
  }, [alertId, alertContext]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = {
      role: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history for API
      const history = messages.map(msg => ({
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
          alertId
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      const aiMsg = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        claims: Array.isArray(data.truth?.claims) ? data.truth.claims : [],
        unknowns: Array.isArray(data.truth?.unknowns) ? data.truth.unknowns : [],
        evidence: Array.isArray(data.truth?.evidence) ? data.truth.evidence : [],
        confidenceScore: typeof data.truth?.confidenceScore === "number" ? data.truth.confidenceScore : null,
        confidenceLabel: data.truth?.confidenceLabel || null,
        verificationStatus: data.truth?.verificationStatus || null,
        needsAnalystValidation: Boolean(data.truth?.needsAnalystValidation)
      };

      setMessages(prev => [...prev, aiMsg]);

    } catch (err) {
      console.error("Chat error:", err);

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Sorry, I'm having trouble connecting to the AI service. ${err.message}`,
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = async () => {
    if (!alertId) return;
    if (!window.confirm("Clear all conversation history for this alert? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/ai/chat-history/${alertId}`, {
        method: "DELETE",
        headers: withSecurityHeaders()
      });
      if (!res.ok) {
        throw new Error("Failed to clear history");
      }
      // Reset messages to welcome message
      const welcomeMsg = {
        role: "assistant",
        content: buildWelcomeMessage(),
        timestamp: new Date()
      };
      setMessages([welcomeMsg]);
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear conversation history");
    }
  };

  const getLastMessageTime = () => {
    if (messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    return lastMsg.timestamp ? new Date(lastMsg.timestamp) : null;
  };

  const formatTimeAgo = (date) => {
    if (!date) return "N/A";
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={styles.container}>
      {alertContext && (
        <div style={styles.alertContext}>
          <h4 style={styles.alertTitle}>
            <span>🎯</span>
            ALERT CONTEXT
          </h4>
          <div style={styles.alertDetails}>
            <span style={styles.alertBadge}>{alertContext.type}</span>
            <span style={styles.alertInfo}>
              Signal: {alertContext.signal} dBm
            </span>
            {alertContext.mitre && (
              <span style={styles.mitreBadge}>
                {alertContext.mitre.technique_id}: {alertContext.mitre.name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chat Header */}
      <div style={styles.chatHeader}>
        <div style={styles.chatHeaderLeft}>
          <span style={styles.chatHeaderTitle}>💬 Analyst Chat</span>
          <span style={styles.chatHeaderMeta}>
            {messages.length > 0 ? `${messages.length} messages` : "No messages"}
            {getLastMessageTime() && ` • Last: ${formatTimeAgo(getLastMessageTime())}`}
          </span>
        </div>
        <button
          onClick={clearHistory}
          disabled={messages.length === 0 || loading}
          style={{
            ...styles.clearButton,
            ...(messages.length === 0 || loading ? styles.clearButtonDisabled : {})
          }}
          title="Clear conversation history for this alert"
        >
          🗑 Clear
        </button>
      </div>

      <div style={styles.chatWindow}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageContainer,
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
            }}
          >
            <div
              style={{
                ...styles.message,
                ...(msg.role === "user" ? styles.userMessage : styles.aiMessage),
                ...(msg.isError ? styles.errorMessage : {})
              }}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ margin: "0.5em 0" }}>{children}</p>
                    ),
                    code: ({ inline, children }) => (
                      <code
                        style={{
                          ...styles.code,
                          ...(inline ? styles.inlineCode : styles.blockCode)
                        }}
                      >
                        {children}
                      </code>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ marginLeft: "1.2em" }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol style={{ marginLeft: "1.2em" }}>{children}</ol>
                    )
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <div>{msg.content}</div>
              )}

              {msg.role === "assistant" && msg.confidenceLabel && (
                <div style={styles.truthMetaRow}>
                  <span
                    style={{
                      ...styles.confidenceBadge,
                      ...(msg.confidenceLabel === "high"
                        ? styles.confidenceHigh
                        : msg.confidenceLabel === "medium"
                          ? styles.confidenceMedium
                          : styles.confidenceLow)
                    }}
                  >
                    Confidence: {msg.confidenceLabel.toUpperCase()}
                    {typeof msg.confidenceScore === "number" ? ` (${Math.round(msg.confidenceScore * 100)}%)` : ""}
                  </span>
                  {msg.verificationStatus ? (
                    <span style={styles.verificationText}>
                      Verification: {msg.verificationStatus.replace("_", " ")}
                    </span>
                  ) : null}
                </div>
              )}

              {msg.role === "assistant" && msg.needsAnalystValidation && (
                <div style={styles.validationWarning}>
                  Needs analyst validation due to low confidence.
                </div>
              )}

              {msg.role === "assistant" && Array.isArray(msg.unknowns) && msg.unknowns.length > 0 && (
                <div style={styles.unknownsText}>
                  Unknowns: {msg.unknowns.join("; ")}
                </div>
              )}

              <div style={styles.timestamp}>
                {msg.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={styles.messageContainer}>
            <div style={styles.loadingIndicator}>
              <div style={styles.loadingDot} />
              <div style={{ ...styles.loadingDot, animationDelay: "0.2s" }} />
              <div style={{ ...styles.loadingDot, animationDelay: "0.4s" }} />
              <span>AI is analyzing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="💬 Ask about this threat, mitigation steps, or network security best practices..."
          rows={2}
          disabled={loading}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(loading || !input.trim() ? styles.sendButtonDisabled : {})
          }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? "⏳ Analyzing..." : "↗ Send"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0f172a",
    overflow: "hidden"
  },
  alertContext: {
    padding: "20px 24px",
    background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
    borderBottom: "1px solid #334155",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
  },
  alertTitle: {
    margin: "0 0 12px 0",
    color: "#f1f5f9",
    fontSize: "14px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  alertDetails: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center"
  },
  alertBadge: {
    padding: "8px 14px",
    background: "#1e40af",
    color: "#dbeafe",
    border: "1px solid #3b82f6",
    fontWeight: "700",
    borderRadius: "8px",
    fontSize: "14px",
    letterSpacing: "0.3px"
  },
  alertInfo: {
    padding: "8px 14px",
    background: "#0f172a",
    color: "#94a3b8",
    borderRadius: "8px",
    border: "1px solid #334155",
    fontSize: "13px",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace"
  },
  mitreBadge: {
    padding: "8px 14px",
    background: "#14532d",
    color: "#86efac",
    border: "1px solid #166534",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace"
  },
  chatHeader: {
    padding: "16px 24px",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px"
  },
  chatHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  chatHeaderTitle: {
    color: "#f1f5f9",
    fontSize: "13px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  chatHeaderMeta: {
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "500"
  },
  clearButton: {
    padding: "8px 14px",
    background: "#ef4444",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
    transition: "all 0.2s",
    whiteSpace: "nowrap"
  },
  clearButtonDisabled: {
    background: "#6b7280",
    cursor: "not-allowed",
    opacity: "0.5"
  },
  chatWindow: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    background: "#0f172a"
  },
  messageContainer: {
    display: "flex",
    width: "100%",
    marginBottom: "4px"
  },
  message: {
    maxWidth: "75%",
    padding: "14px 18px",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: "1.6",
    wordWrap: "break-word",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
  },
  userMessage: {
    background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
    color: "#f0f9ff",
    border: "1px solid #3b82f6",
    borderRadius: "12px 12px 4px 12px"
  },
  aiMessage: {
    background: "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: "12px 12px 12px 4px"
  },
  errorMessage: {
    background: "#7f1d1d",
    color: "#fecaca",
    border: "1px solid #991b1b"
  },
  truthMetaRow: {
    marginTop: "10px",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center"
  },
  confidenceBadge: {
    fontSize: "11px",
    fontWeight: "700",
    padding: "3px 8px",
    borderRadius: "999px",
    border: "1px solid transparent",
    letterSpacing: "0.3px"
  },
  confidenceHigh: {
    background: "#14532d",
    color: "#bbf7d0",
    borderColor: "#166534"
  },
  confidenceMedium: {
    background: "#713f12",
    color: "#fde68a",
    borderColor: "#a16207"
  },
  confidenceLow: {
    background: "#7f1d1d",
    color: "#fecaca",
    borderColor: "#991b1b"
  },
  verificationText: {
    fontSize: "11px",
    color: "#93c5fd"
  },
  validationWarning: {
    marginTop: "8px",
    fontSize: "12px",
    color: "#fca5a5"
  },
  unknownsText: {
    marginTop: "6px",
    fontSize: "11px",
    color: "#cbd5e1"
  },
  timestamp: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "8px",
    fontWeight: "500"
  },
  code: {
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace",
    fontSize: "13px"
  },
  inlineCode: {
    background: "#334155",
    color: "#a78bfa",
    padding: "2px 6px",
    borderRadius: "4px",
    border: "1px solid #475569"
  },
  blockCode: {
    background: "#0f172a",
    color: "#94a3b8",
    padding: "12px",
    borderRadius: "6px",
    display: "block",
    overflowX: "auto",
    border: "1px solid #334155"
  },
  inputContainer: {
    padding: "20px 24px",
    background: "#1e293b",
    borderTop: "1px solid #334155",
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.2)"
  },
  input: {
    flex: 1,
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "12px 16px",
    color: "#e2e8f0",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    lineHeight: "1.5",
    transition: "border-color 0.2s"
  },
  sendButton: {
    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    padding: "12px 28px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700",
    transition: "all 0.2s",
    boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
    letterSpacing: "0.3px"
  },
  sendButtonDisabled: {
    background: "#334155",
    color: "#64748b",
    cursor: "not-allowed",
    boxShadow: "none"
  },
  loadingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "14px 18px",
    background: "#1e293b",
    borderRadius: "12px 12px 12px 4px",
    border: "1px solid #334155",
    color: "#94a3b8",
    fontSize: "14px",
    maxWidth: "75%"
  },
  loadingDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#60a5fa",
    animation: "pulse 1.5s ease-in-out infinite"
  }
};

export default ChatInterface;
