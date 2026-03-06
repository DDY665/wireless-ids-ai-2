import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

function ChatInterface({ alertId = null, alertContext = null }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add welcome message
  useEffect(() => {
    const welcomeMsg = alertId && alertContext
      ? `Hello! I'm your cybersecurity assistant. I can help you understand the **${alertContext.type}** attack detected. Ask me anything!`
      : "Hello! I'm your cybersecurity assistant. Ask me about wireless security, intrusion detection, or any security questions you have!";

    setMessages([
      {
        role: "assistant",
        content: welcomeMsg,
        timestamp: new Date()
      }
    ]);
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
        headers: {
          "Content-Type": "application/json"
        },
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
        timestamp: new Date()
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

  return (
    <div style={styles.container}>
      {/* Alert Context Card (if alert is selected) */}
      {alertContext && (
        <div style={styles.alertContext}>
          <h4 style={styles.alertTitle}>📡 Alert Context</h4>
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

      {/* Chat Messages */}
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
                    // Style markdown elements
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
            <div style={{ ...styles.message, ...styles.aiMessage }}>
              <div style={styles.typingIndicator}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputContainer}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question about this attack or wireless security..."
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
          {loading ? "⏳" : "Send"}
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
    backgroundColor: "#0d1117",
    borderRadius: "8px",
    overflow: "hidden"
  },
  alertContext: {
    padding: "16px",
    backgroundColor: "#161b22",
    borderBottom: "1px solid #30363d"
  },
  alertTitle: {
    margin: "0 0 12px 0",
    color: "#58a6ff",
    fontSize: "14px",
    fontWeight: "600"
  },
  alertDetails: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  alertBadge: {
    padding: "4px 8px",
    backgroundColor: "#da3633",
    color: "#fff",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "600"
  },
  alertInfo: {
    padding: "4px 8px",
    backgroundColor: "#21262d",
    color: "#8b949e",
    borderRadius: "4px",
    fontSize: "12px"
  },
  mitreBadge: {
    padding: "4px 8px",
    backgroundColor: "#1f6feb",
    color: "#fff",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "500"
  },
  chatWindow: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  },
  messageContainer: {
    display: "flex",
    width: "100%"
  },
  message: {
    maxWidth: "75%",
    padding: "12px 16px",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: "1.5",
    position: "relative",
    wordWrap: "break-word"
  },
  userMessage: {
    backgroundColor: "#1f6feb",
    color: "#ffffff"
  },
  aiMessage: {
    backgroundColor: "#21262d",
    color: "#c9d1d9"
  },
  errorMessage: {
    backgroundColor: "#da3633",
    color: "#ffffff"
  },
  timestamp: {
    fontSize: "10px",
    opacity: 0.6,
    marginTop: "6px",
    textAlign: "right"
  },
  code: {
    fontFamily: "Consolas, Monaco, 'Courier New', monospace",
    fontSize: "13px"
  },
  inlineCode: {
    backgroundColor: "#161b22",
    padding: "2px 6px",
    borderRadius: "3px",
    border: "1px solid #30363d"
  },
  blockCode: {
    display: "block",
    backgroundColor: "#161b22",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #30363d",
    overflowX: "auto",
    margin: "8px 0"
  },
  typingIndicator: {
    display: "flex",
    gap: "4px",
    padding: "4px 0"
  },
  inputContainer: {
    display: "flex",
    gap: "12px",
    padding: "16px",
    backgroundColor: "#161b22",
    borderTop: "1px solid #30363d"
  },
  input: {
    flex: 1,
    backgroundColor: "#0d1117",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "none",
    outline: "none"
  },
  sendButton: {
    backgroundColor: "#238636",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "12px 24px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    transition: "background-color 0.2s"
  },
  sendButtonDisabled: {
    backgroundColor: "#21262d",
    color: "#6e7681",
    cursor: "not-allowed"
  }
};

// Add CSS for typing indicator animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes blink {
    0%, 80%, 100% { opacity: 0; }
    40% { opacity: 1; }
  }
  
  div[style*="typingIndicator"] span {
    display: inline-block;
    width: 8px;
    height: 8px;
    background-color: #8b949e;
    border-radius: 50%;
    animation: blink 1.4s infinite;
  }
  
  div[style*="typingIndicator"] span:nth-child(2) {
    animation-delay: 0.2s;
  }
  
  div[style*="typingIndicator"] span:nth-child(3) {
    animation-delay: 0.4s;
  }
`;
document.head.appendChild(styleSheet);

export default ChatInterface;
