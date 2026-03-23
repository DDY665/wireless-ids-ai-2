import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import ChatInterface from "./ChatInterface";
import { withSecurityHeaders } from "../src/apiSecurity";

const DEFAULT_FILTERS = {
  status: "all",
  severityLevel: "all",
  type: "all",
  source: "all",
  mitreTechnique: "",
  search: "",
  correlatedOnly: false
};

function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.severityLevel !== "all" ||
    filters.type !== "all" ||
    filters.source !== "all" ||
    Boolean(filters.mitreTechnique.trim()) ||
    Boolean(filters.search.trim()) ||
    filters.correlatedOnly;

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.severityLevel !== "all") params.set("severityLevel", filters.severityLevel);
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.source !== "all") params.set("source", filters.source);
      if (filters.mitreTechnique.trim()) params.set("mitreTechnique", filters.mitreTechnique.trim());
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.correlatedOnly) params.set("correlatedOnly", "true");

      const query = params.toString();
      const url = query ? `http://localhost:5000/alerts?${query}` : "http://localhost:5000/alerts";

      const res = await fetch(url, {
        headers: withSecurityHeaders(),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      if (!res.ok) {
        const statusText = res.status === 404 ? "Endpoint not found" :
          res.status === 500 ? "Server error" :
            res.status === 503 ? "Service unavailable" :
              `Server returned ${res.status}`;
        throw new Error(statusText);
      }
      const data = await res.json();
      setAlerts(data);
      setSelectedAlert((prev) => {
        if (data.length === 0) {
          return null;
        }
        if (!prev) {
          return null;
        }
        return data.some((a) => a._id === prev._id) ? prev : null;
      });
    } catch (err) {
      console.error(err);
      // Better error messages
      if (err.name === "TimeoutError") {
        setError("Request timed out. Server might be slow or unavailable.");
      } else if (err.message.includes("fetch")) {
        setError("Cannot connect to server. Make sure the backend is running on port 5000.");
      } else {
        setError(err.message || "Failed to fetch alerts");
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  async function clearAlerts() {
    try {
      setActionLoading(true);
      setError("");
      const res = await fetch("http://localhost:5000/alerts/reset", {
        method: "DELETE",
        headers: withSecurityHeaders()
      });
      if (!res.ok) {
        throw new Error(`Failed to clear alerts (${res.status})`);
      }
      setAlerts([]);
      setSelectedAlert(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to clear alerts");
    } finally {
      setActionLoading(false);
    }
  }

  async function createTestAlert(type) {
    try {
      setActionLoading(true);
      setError("");
      const res = await fetch(`http://localhost:5000/alerts/test?type=${type}`, {
        headers: withSecurityHeaders()
      });
      if (!res.ok) {
        throw new Error(`Failed to create test alert (${res.status})`);
      }
      await fetchAlerts();
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create test alert");
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const socket = io("http://localhost:5000", {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

    socket.on("connect", () => {
      setSocketConnected(true);
      setError(""); // Clear any connection errors
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);

      socket.on("reconnect_attempt", (attemptNumber) => {
        console.log(`Attempting to reconnect (${attemptNumber})...`);
      });

      socket.on("reconnect_failed", () => {
        setError("Failed to reconnect to server after multiple attempts");
      });
    });

    socket.on("new-alert", (alert) => {
      try {
        fetchAlerts();
        if (!selectedAlert) {
          setSelectedAlert(alert);
        }
      } catch (err) {
        console.error("Error handling new alert:", err);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      setError("Real-time connection failed. Updates may be delayed.");
    });

    return () => socket.close();
  }, [fetchAlerts, selectedAlert]);

  // Helper function to determine alert severity
  const getAlertSeverity = (alert) => {
    if (alert?.severityLevel) {
      return alert.severityLevel;
    }

    const type = alert?.type;
    const highSeverity = ['DEAUTHFLOOD', 'DISCONFLOOD', 'BSSTIMESTAMP'];
    const mediumSeverity = ['BEACONFLOOD', 'NULLPROBERESP'];
    if (highSeverity.includes(type)) return 'high';
    if (mediumSeverity.includes(type)) return 'medium';
    return 'low';
  };

  const alertTypes = Array.from(new Set(alerts.map((a) => a.type))).sort();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🛡️</span>
            <div>
              <h1 style={styles.title}>Wireless IDS</h1>
              <p style={styles.subtitle}>AI-Powered Intrusion Detection & Analysis</p>
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.statusContainer}>
            <div style={{
              ...styles.statusIndicator,
              backgroundColor: socketConnected ? "#10b981" : "#ef4444"
            }} />
            <span style={styles.statusText}>
              {socketConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            style={styles.toolbarButton}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Show alerts" : "Hide alerts"}
          >
            {sidebarCollapsed ? "☰ Show Alerts" : "‹ Hide"}
          </button>
          <button
            style={styles.toolbarButton}
            onClick={fetchAlerts}
            disabled={loading || actionLoading}
          >
            ⟳ Refresh
          </button>
        </div>
        <div style={styles.toolbarCenter}>
          <span style={styles.alertCount}>
            {alerts.length} {alerts.length === 1 ? 'Alert' : 'Alerts'} {hasActiveFilters ? 'Matched' : 'Detected'}
          </span>
        </div>
        <div style={styles.toolbarRight}>
          <button
            style={styles.simulateButton}
            onClick={() => createTestAlert("SSIDCONFLICT")}
            disabled={actionLoading}
          >
            + SSID Attack
          </button>
          <button
            style={styles.simulateButton}
            onClick={() => createTestAlert("BEACONFLOOD")}
            disabled={actionLoading}
          >
            + Beacon Flood
          </button>
          <button
            style={styles.clearButton}
            onClick={clearAlerts}
            disabled={actionLoading}
          >
            🗑 Clear All
          </button>
        </div>
      </div>

      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Status</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            style={styles.filterSelect}
          >
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="triaged">Triaged</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Severity</span>
          <select
            value={filters.severityLevel}
            onChange={(e) => setFilters((prev) => ({ ...prev, severityLevel: e.target.value }))}
            style={styles.filterSelect}
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Type</span>
          <select
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
            style={styles.filterSelect}
          >
            <option value="all">All</option>
            {alertTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Source</span>
          <select
            value={filters.source}
            onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
            style={styles.filterSelect}
          >
            <option value="all">All</option>
            <option value="kismet">Kismet</option>
            <option value="simulated">Simulated</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div style={styles.filterGroupWide}>
          <span style={styles.filterLabel}>Search</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Type, MAC, BSSID, MITRE..."
            style={styles.filterInput}
          />
        </div>

        <label style={styles.filterToggle}>
          <input
            type="checkbox"
            checked={filters.correlatedOnly}
            onChange={(e) => setFilters((prev) => ({ ...prev, correlatedOnly: e.target.checked }))}
          />
          Correlated only
        </label>

        <button
          style={styles.filterClearButton}
          onClick={() => setFilters(DEFAULT_FILTERS)}
          disabled={!hasActiveFilters}
        >
          Clear Filters
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span style={styles.errorIcon}>⚠</span>
          {error}
        </div>
      )}

      <main style={{
        ...styles.main,
        gridTemplateColumns: sidebarCollapsed ? "0px 1fr" : "380px 1fr"
      }}>
        {!sidebarCollapsed && (
          <aside style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>Threat Alerts</h2>
              <span style={styles.alertBadge}>{alerts.length}</span>
            </div>

            <div style={styles.alertList}>
              {loading ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>⏳</span>
                  <p style={styles.emptyText}>Loading alerts...</p>
                </div>
              ) : alerts.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>✓</span>
                  <p style={styles.emptyText}>No threats detected</p>
                  <p style={styles.emptySubtext}>Your network is secure</p>
                </div>
              ) : (
                alerts.map((alert) => {
                  const severity = getAlertSeverity(alert);
                  const isSelected = selectedAlert?._id === alert._id;

                  return (
                    <button
                      key={alert._id}
                      style={{
                        ...styles.alertCard,
                        ...(isSelected && styles.alertCardSelected),
                        borderLeftColor:
                          severity === 'high' ? '#ef4444' :
                            severity === 'medium' ? '#f59e0b' : '#3b82f6'
                      }}
                      onClick={() => setSelectedAlert(alert)}
                      type="button"
                    >
                      <div style={styles.alertCardHeader}>
                        <span style={{
                          ...styles.severityBadge,
                          backgroundColor:
                            severity === 'high' ? '#7f1d1d' :
                              severity === 'medium' ? '#78350f' : '#1e3a8a',
                          color:
                            severity === 'high' ? '#fca5a5' :
                              severity === 'medium' ? '#fcd34d' : '#93c5fd'
                        }}>
                          {severity === 'high' ? '🔴' : severity === 'medium' ? '🟠' : '🔵'}
                          {' ' + severity.toUpperCase()}
                        </span>
                        <span style={styles.alertTime}>
                          {new Date(alert.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <div style={styles.alertType}>
                        {alert.type}
                        {alert.correlationCount > 1 ? (
                          <span style={styles.alertTypeCorrelation}> 🔗 {alert.correlationCount}</span>
                        ) : null}
                      </div>

                      <div style={styles.alertMeta}>
                        <div style={styles.metaItem}>
                          <span style={styles.metaLabel}>Signal:</span>
                          <span style={styles.metaValue}>{alert.signal} dBm</span>
                        </div>
                        {alert.mitre && (
                          <div style={styles.metaItem}>
                            <span style={styles.metaLabel}>MITRE:</span>
                            <span style={styles.metaValue}>{alert.mitre.technique_id}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <section style={styles.chatSection}>
          {selectedAlert ? (
            <ChatInterface
              alertId={selectedAlert._id}
              alertContext={{
                type: selectedAlert.type,
                signal: selectedAlert.signal,
                mitre: selectedAlert.mitre,
                timestamp: selectedAlert.timestamp
              }}
            />
          ) : (
            <div style={styles.emptyChat}>
              <span style={styles.emptyChatIcon}>💬</span>
              <h3 style={styles.emptyChatTitle}>No Alert Selected</h3>
              <p style={styles.emptyChatText}>
                Select a threat alert from the sidebar to begin AI-powered analysis
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    color: "#e2e8f0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    padding: "0"
  },
  header: {
    background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
    borderBottom: "1px solid #334155",
    padding: "20px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  logoIcon: {
    fontSize: "32px",
    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))"
  },
  title: {
    margin: 0,
    fontSize: "24px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "-0.5px"
  },
  subtitle: {
    margin: "2px 0 0",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: "400"
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  statusContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#1e293b",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid #334155"
  },
  statusIndicator: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    boxShadow: "0 0 8px currentColor",
    animation: "pulse 2s ease-in-out infinite"
  },
  statusText: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e2e8f0"
  },
  toolbar: {
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    padding: "12px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap"
  },
  filterBar: {
    background: "#0f172a",
    borderBottom: "1px solid #334155",
    padding: "10px 32px",
    display: "flex",
    alignItems: "end",
    gap: "10px",
    flexWrap: "wrap"
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "120px"
  },
  filterGroupWide: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "230px"
  },
  filterLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  filterSelect: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#e2e8f0",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px"
  },
  filterInput: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#e2e8f0",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px"
  },
  filterToggle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#cbd5e1",
    fontSize: "12px",
    fontWeight: "600",
    paddingBottom: "6px"
  },
  filterClearButton: {
    background: "#334155",
    border: "1px solid #475569",
    color: "#e2e8f0",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600"
  },
  toolbarLeft: {
    display: "flex",
    gap: "8px",
    flex: "0 0 auto"
  },
  toolbarCenter: {
    flex: "1 1 auto",
    textAlign: "center"
  },
  toolbarRight: {
    display: "flex",
    gap: "8px",
    flex: "0 0 auto"
  },
  alertCount: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#cbd5e1",
    padding: "6px 16px",
    background: "#0f172a",
    borderRadius: "6px",
    border: "1px solid #334155"
  },
  toolbarButton: {
    background: "#334155",
    border: "1px solid #475569",
    color: "#e2e8f0",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    transition: "all 0.2s",
    "&:hover": {
      background: "#475569"
    }
  },
  simulateButton: {
    background: "#1e40af",
    border: "1px solid #3b82f6",
    color: "#dbeafe",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    transition: "all 0.2s"
  },
  clearButton: {
    background: "#7f1d1d",
    border: "1px solid #991b1b",
    color: "#fecaca",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    transition: "all 0.2s"
  },
  errorBanner: {
    background: "#7f1d1d",
    border: "1px solid #991b1b",
    borderLeft: "4px solid #ef4444",
    color: "#fecaca",
    padding: "12px 32px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "14px"
  },
  errorIcon: {
    fontSize: "20px"
  },
  main: {
    display: "grid",
    gap: "0",
    height: "calc(100vh - 140px)",
    overflow: "hidden",
    transition: "grid-template-columns 0.3s ease"
  },
  sidebar: {
    background: "#1e293b",
    borderRight: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  sidebarHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#0f172a"
  },
  sidebarTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "700",
    color: "#f1f5f9",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  alertBadge: {
    background: "#1e40af",
    color: "#dbeafe",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid #3b82f6"
  },
  alertList: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#64748b"
  },
  emptyIcon: {
    fontSize: "48px",
    display: "block",
    marginBottom: "16px",
    opacity: 0.6
  },
  emptyText: {
    margin: "0 0 8px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#94a3b8"
  },
  emptySubtext: {
    margin: 0,
    fontSize: "14px",
    color: "#64748b"
  },
  alertCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderLeft: "4px solid #3b82f6",
    borderRadius: "8px",
    padding: "16px",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
    position: "relative"
  },
  alertCardSelected: {
    background: "#1e293b",
    borderColor: "#60a5fa",
    boxShadow: "0 0 0 2px #1e40af, 0 4px 12px rgba(59, 130, 246, 0.3)",
    transform: "translateX(4px)"
  },
  alertCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px"
  },
  severityBadge: {
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
    border: "1px solid currentColor"
  },
  alertTime: {
    fontSize: "12px",
    color: "#64748b",
    fontWeight: "500"
  },
  alertType: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#f1f5f9",
    marginBottom: "12px",
    letterSpacing: "-0.3px"
  },
  alertTypeCorrelation: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#93c5fd"
  },
  alertMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  metaItem: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px"
  },
  metaLabel: {
    color: "#64748b",
    fontWeight: "500"
  },
  metaValue: {
    color: "#cbd5e1",
    fontWeight: "600",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace"
  },
  chatSection: {
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  emptyChat: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "#64748b",
    padding: "40px"
  },
  emptyChatIcon: {
    fontSize: "64px",
    marginBottom: "24px",
    opacity: 0.5
  },
  emptyChatTitle: {
    margin: "0 0 12px",
    fontSize: "24px",
    fontWeight: "700",
    color: "#94a3b8"
  },
  emptyChatText: {
    margin: 0,
    fontSize: "15px",
    color: "#64748b",
    textAlign: "center",
    maxWidth: "400px",
    lineHeight: "1.6"
  }
};

export default Dashboard;
