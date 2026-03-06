import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import ChatInterface from "./ChatInterface";

function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("http://localhost:5000/alerts");

      if (!res.ok) {
        throw new Error(`Failed to fetch alerts: ${res.statusText}`);
      }

      const data = await res.json();
      setAlerts(data);

    } catch (err) {
      console.error("Error fetching alerts:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch initial alerts
    fetchAlerts();

    // Connect to Socket.IO for real-time updates
    const newSocket = io("http://localhost:5000");

    newSocket.on("connect", () => {
      console.log("✅ Connected to real-time alerts");
    });

    newSocket.on("new-alert", (alert) => {
      console.log("🚨 New alert received:", alert);
      setAlerts(prev => [alert, ...prev]);

      // Show notification
      if (Notification.permission === "granted") {
        new Notification("New Security Alert", {
          body: `${alert.type} detected`,
          icon: "/alert-icon.png"
        });
      }
    });

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
    });

    setSocket(newSocket);

    // Request notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  const getTacticColor = (tactic) => {
    const colors = {
      reconnaissance: "#58a6ff",
      "initial-access": "#f97583",
      execution: "#ea4a5a",
      persistence: "#db6d28",
      "privilege-escalation": "#e3b341",
      "defense-evasion": "#b392f0",
      "credential-access": "#f692ce",
      discovery: "#79c0ff",
      "lateral-movement": "#56d4dd",
      collection: "#39d353",
      impact: "#da3633",
      unknown: "#6e7681"
    };
    return colors[tactic] || colors.unknown;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🛡️ Wireless IDS Dashboard</h1>
          <p style={styles.subtitle}>
            Real-time wireless intrusion detection with AI analysis
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.refreshButton}
            onClick={fetchAlerts}
            disabled={loading}
          >
            {loading ? "⏳" : "🔄"} Refresh
          </button>
          {socket?.connected && (
            <span style={styles.statusIndicator}>
              🟢 Live
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Alerts Panel */}
        <div style={styles.alertsPanel}>
          <h2 style={styles.panelTitle}>
            Detected Alerts ({alerts.length})
          </h2>

          {error && (
            <div style={styles.errorBanner}>
              ❌ {error}
            </div>
          )}

          {loading && alerts.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.spinner}></div>
              <p>Loading alerts...</p>
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>🎉</p>
              <p>No alerts detected yet!</p>
              <p style={styles.emptySubtext}>
                The system is monitoring for threats.
              </p>
            </div>
          )}

          <div style={styles.alertsList}>
            {alerts.map((alert) => (
              <div
                key={alert._id}
                style={{
                  ...styles.alertCard,
                  ...(selectedAlert?._id === alert._id
                    ? styles.alertCardSelected
                    : {})
                }}
                onClick={() => setSelectedAlert(alert)}
              >
                <div style={styles.alertHeader}>
                  <span style={styles.alertType}>{alert.type}</span>
                  <span style={styles.alertTime}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {alert.mitre && (
                  <div style={styles.mitreInfo}>
                    <span
                      style={{
                        ...styles.tacticBadge,
                        backgroundColor: getTacticColor(alert.mitre.tactic)
                      }}
                    >
                      {alert.mitre.tactic}
                    </span>
                    <span style={styles.techniqueId}>
                      {alert.mitre.technique_id}
                    </span>
                    <span style={styles.techniqueName}>
                      {alert.mitre.name}
                    </span>
                  </div>
                )}

                <div style={styles.alertMeta}>
                  <span>Signal: {alert.signal} dBm</span>
                  {alert.source_mac && (
                    <span>MAC: {alert.source_mac.substring(0, 12)}...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        <div style={styles.chatPanel}>
          {selectedAlert ? (
            <>
              <div style={styles.chatHeader}>
                <h3 style={styles.chatTitle}>AI Security Assistant</h3>
                <button
                  style={styles.closeButton}
                  onClick={() => setSelectedAlert(null)}
                >
                  ✕
                </button>
              </div>
              <ChatInterface
                alertId={selectedAlert._id}
                alertContext={{
                  type: selectedAlert.type,
                  signal: selectedAlert.signal,
                  mitre: selectedAlert.mitre
                }}
              />
            </>
          ) : (
            <div style={styles.noChatSelected}>
              <div style={styles.noChatContent}>
                <p style={styles.noChatIcon}>💬</p>
                <h3>Select an alert to analyze</h3>
                <p style={styles.noChatSubtext}>
                  Click on any alert to start a conversation with the AI
                  assistant and learn more about the threat.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    backgroundColor: "#010409",
    color: "#c9d1d9",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  header: {
    padding: "24px 32px",
    backgroundColor: "#161b22",
    borderBottom: "1px solid #30363d",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    margin: 0,
    color: "#58a6ff",
    fontSize: "28px",
    fontWeight: "600"
  },
  subtitle: {
    margin: "4px 0 0 0",
    color: "#8b949e",
    fontSize: "14px"
  },
  headerActions: {
    display: "flex",
    gap: "12px",
    alignItems: "center"
  },
  refreshButton: {
    backgroundColor: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: "6px",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500"
  },
  statusIndicator: {
    padding: "6px 12px",
    backgroundColor: "#0d1117",
    borderRadius: "12px",
    fontSize: "13px",
    border: "1px solid #238636"
  },
  mainContent: {
    flex: 1,
    display: "flex",
    overflow: "hidden"
  },
  alertsPanel: {
    width: "400px",
    backgroundColor: "#0d1117",
    borderRight: "1px solid #30363d",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  panelTitle: {
    margin: 0,
    padding: "20px 24px",
    fontSize: "16px",
    fontWeight: "600",
    borderBottom: "1px solid #30363d"
  },
  errorBanner: {
    margin: "12px",
    padding: "12px",
    backgroundColor: "#da3633",
    color: "#fff",
    borderRadius: "6px",
    fontSize: "13px"
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
    textAlign: "center",
    color: "#6e7681"
  },
  emptyIcon: {
    fontSize: "48px",
    margin: "0 0 12px 0"
  },
  emptySubtext: {
    fontSize: "13px",
    color: "#6e7681"
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid #21262d",
    borderTop: "3px solid #58a6ff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "12px"
  },
  alertsList: {
    flex: 1,
    overflowY: "auto",
    padding: "12px"
  },
  alertCard: {
    padding: "16px",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
    marginBottom: "8px",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  alertCardSelected: {
    backgroundColor: "#1f6feb20",
    borderColor: "#1f6feb"
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px"
  },
  alertType: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#f85149"
  },
  alertTime: {
    fontSize: "12px",
    color: "#8b949e"
  },
  mitreInfo: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "12px"
  },
  tacticBadge: {
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase"
  },
  techniqueId: {
    padding: "3px 8px",
    backgroundColor: "#21262d",
    borderRadius: "4px",
    fontSize: "11px",
    color: "#58a6ff",
    fontWeight: "600"
  },
  techniqueName: {
    fontSize: "12px",
    color: "#c9d1d9"
  },
  alertMeta: {
    display: "flex",
    gap: "12px",
    fontSize: "12px",
    color: "#8b949e"
  },
  chatPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0d1117"
  },
  chatHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #30363d",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  chatTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "600"
  },
  closeButton: {
    backgroundColor: "transparent",
    border: "none",
    color: "#8b949e",
    fontSize: "20px",
    cursor: "pointer",
    padding: "4px 8px"
  },
  noChatSelected: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  noChatContent: {
    textAlign: "center",
    maxWidth: "400px",
    padding: "32px"
  },
  noChatIcon: {
    fontSize: "64px",
    margin: "0 0 16px 0"
  },
  noChatSubtext: {
    color: "#6e7681",
    fontSize: "14px",
    marginTop: "8px"
  }
};

// Add spinner animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default Dashboard;
