// ...existing code...
import React, { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import ChatInterface from "./ChatInterface";
import { withSecurityHeaders, getApiUrl, getSocketUrl } from "../src/apiSecurity";
import "./dashboard.css";

const DEFAULT_FILTERS = {
  status: "all",
  severityLevel: "all",
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
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("wi-theme");
    return saved === "dark" ? "dark" : "light";
  });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    document.body.classList.remove("wi-theme-light", "wi-theme-dark");
    document.body.classList.add(theme === "dark" ? "wi-theme-dark" : "wi-theme-light");
    return () => {
      document.body.classList.remove("wi-theme-light", "wi-theme-dark");
    };
  }, [theme]);

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.severityLevel !== "all" ||
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
      if (filters.source !== "all") params.set("source", filters.source);
      if (filters.mitreTechnique.trim()) params.set("mitreTechnique", filters.mitreTechnique.trim());
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.correlatedOnly) params.set("correlatedOnly", "true");
      const query = params.toString();
      const baseAlertsUrl = getApiUrl("alerts");
      const url = query ? `${baseAlertsUrl}?${query}` : baseAlertsUrl;
      const res = await fetch(url, {
        headers: withSecurityHeaders(),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        const statusText = res.status === 404
          ? "Endpoint not found"
          : res.status === 500
            ? "Server error"
            : res.status === 503
              ? "Service unavailable"
              : `Server returned ${res.status}`;
        throw new Error(statusText);
      }
      const data = await res.json();
      setAlerts(data);
      setSelectedAlert((prev) => {
        if (data.length === 0) return null;
        if (!prev) return null;
        return data.some((a) => a._id === prev._id) ? prev : null;
      });
    } catch (err) {
      console.error(err);
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
      const res = await fetch(getApiUrl("alerts/reset"), {
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

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });
    socket.on("connect", () => {
      setSocketConnected(true);
      setError("");
    });
    socket.on("disconnect", () => {
      setSocketConnected(false);
    });
    socket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Attempting to reconnect (${attemptNumber})...`);
    });
    socket.on("reconnect_failed", () => {
      setError("Failed to reconnect to server after multiple attempts");
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

  const getAlertSeverity = (alert) => {
    if (alert?.severityLevel) return alert.severityLevel;
    const type = alert?.type;
    const highSeverity = ["DEAUTHFLOOD", "DISASSOCFLOOD", "BSSTIMESTAMP"];
    const mediumSeverity = ["BEACONFLOOD", "NULLPROBERESP"];
    if (highSeverity.includes(type)) return "high";
    if (mediumSeverity.includes(type)) return "medium";
    return "low";
  };

  const closeMobileSetup = () => setMobileSetupOpen(false);
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem("wi-theme", next);
      return next;
    });
  };

  return (
    <div className={`wi-page ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <header className="wi-header">
        <div className="wi-brand">
          <div className="wi-brand-icon">🛡</div>
          <div>
            <div className="wi-brand-title">Wireless IDS</div>
            <div className="wi-brand-sub">AI Incident Assistant</div>
          </div>
        </div>
        <div className="wi-header-right">
          <button
            className="wi-theme-toggle"
            onClick={toggleTheme}
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="wi-theme-icon" aria-hidden="true">{theme === "dark" ? "☀" : "🌙"}</span>
            <span className="wi-theme-text">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <div className="wi-header-status">
            <div className={`wi-status-dot ${socketConnected ? "is-online" : "is-offline"}`} />
            <span>{socketConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </header>
      <div className="wi-mobile-bar">
        <button className="wi-btn wi-btn-neutral" onClick={() => setMobileSetupOpen(true)} type="button">
          Alerts Panel
        </button>
        <button
          className="wi-btn wi-btn-neutral"
          onClick={fetchAlerts}
          disabled={loading || actionLoading}
          type="button"
        >
          Refresh
        </button>
      </div>
      <main className="wi-main-shell">
        <div className={`wi-overlay ${mobileSetupOpen ? "is-open" : ""}`} onClick={closeMobileSetup} />
        {!sidebarCollapsed && (
          <aside className={`wi-left-panel ${mobileSetupOpen ? "is-open" : ""}`}>
            <section className="wi-panel-card">
              <p className="wi-panel-title">Filters</p>
              <div className="wi-filter-grid">
                <label className="wi-field">
                  <span>Status</span>
                  <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="all">All</option>
                    <option value="new">New</option>
                    <option value="triaged">Triaged</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="false_positive">False Positive</option>
                  </select>
                </label>
                <label className="wi-field">
                  <span>Severity</span>
                  <select
                    value={filters.severityLevel}
                    onChange={(e) => setFilters((prev) => ({ ...prev, severityLevel: e.target.value }))}
                  >
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <label className="wi-field">
                  <span>Source</span>
                  <select value={filters.source} onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}>
                    <option value="all">All</option>
                    <option value="kismet">Kismet</option>
                    <option value="simulated">Simulated</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
                <label className="wi-field wi-field-wide">
                  <span>Search</span>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    placeholder="Type, MAC, BSSID, MITRE..."
                  />
                </label>
                <label className="wi-field wi-field-wide">
                  <span>MITRE Technique</span>
                  <input
                    type="text"
                    value={filters.mitreTechnique}
                    onChange={(e) => setFilters((prev) => ({ ...prev, mitreTechnique: e.target.value }))}
                    placeholder="e.g. T1499"
                  />
                </label>
                <label className="wi-check-field">
                  <input
                    type="checkbox"
                    checked={filters.correlatedOnly}
                    onChange={(e) => setFilters((prev) => ({ ...prev, correlatedOnly: e.target.checked }))}
                  />
                  Correlated only
                </label>
              </div>
              <div className="wi-row-actions">
                <button
                  className="wi-btn wi-btn-neutral"
                  disabled={!hasActiveFilters}
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  type="button"
                >
                  Clear Filters
                </button>
                <button className="wi-btn wi-btn-neutral" onClick={fetchAlerts} disabled={loading || actionLoading} type="button">
                  Reload
                </button>
              </div>
            </section>
            <section className="wi-panel-card wi-alerts-card">
              <div className="wi-alerts-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <p className="wi-panel-title" style={{ marginRight: 8 }}>Threat Alerts</p>
                  <span className="wi-count-pill">{alerts.length}</span>
                </div>
                <button
                  className="wi-btn wi-btn-danger"
                  style={{ marginLeft: 8, padding: '2px 10px', fontSize: '0.95em' }}
                  onClick={clearAlerts}
                  disabled={actionLoading || alerts.length === 0}
                  type="button"
                >
                  Clear All
                </button>
              </div>
              <div className={`wi-alert-list ${alerts.length > 2 ? "is-scrollable" : ""}`}>
                {loading ? (
                  <div className="wi-empty-state">
                    <div className="wi-empty-icon">⏳</div>
                    <p>Loading alerts...</p>
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="wi-empty-state">
                    <div className="wi-empty-icon">✓</div>
                    <p>No threats detected</p>
                  </div>
                ) : (
                  // Deduplicate alerts by type, show the most recent alert for each type
                  Array.from(
                    alerts
                      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                      .reduce((map, alert) => {
                        if (!map.has(alert.type)) map.set(alert.type, alert);
                        return map;
                      }, new Map())
                      .values()
                  ).map((alert) => {
                    const severity = getAlertSeverity(alert);
                    const isSelected = selectedAlert?._id === alert._id;
                    return (
                      <button
                        key={alert._id}
                        className={`wi-alert-card severity-${severity} ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          setSelectedAlert(alert);
                          setMobileSetupOpen(false);
                        }}
                        type="button"
                      >
                        <div className="wi-alert-top">
                          <span className="wi-alert-severity">{severity.toUpperCase()}</span>
                          <span className="wi-alert-time">
                            {new Date(alert.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                        <div className="wi-alert-type">
                          {alert.type}
                          {alert.correlationCount > 1 ? <span className="wi-corr-badge"> 🔗 {alert.correlationCount}</span> : null}
                        </div>
                        <div className="wi-alert-meta">
                          <span>Signal: {alert.signal} dBm</span>
                          {alert.mitre?.technique_id ? <span>MITRE: {alert.mitre.technique_id}</span> : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </aside>
        )}
        <section className="wi-right-panel">
          <div className="wi-right-toolbar">
            {/* Removed Show Alerts Panel button */}
            <div className="wi-right-toolbar-mid">
              {alerts.length} {alerts.length === 1 ? "Alert" : "Alerts"} {hasActiveFilters ? "Matched" : "Detected"}
            </div>
            <div className="wi-right-toolbar-right">
              <button className="wi-btn wi-btn-neutral" onClick={fetchAlerts} disabled={loading || actionLoading} type="button">
                Refresh
              </button>
            </div>
          </div>
          {error ? (
            <div className="wi-error-banner">⚠ {error}</div>
          ) : null}
          <div className="wi-chat-shell">
            {selectedAlert ? (
              <>
                <AlertDetailsToggle alert={selectedAlert} />
                <ChatInterface
                  alertId={selectedAlert._id}
                  alertContext={{
                    type: selectedAlert.type,
                    signal: selectedAlert.signal,
                    mitre: selectedAlert.mitre,
                    timestamp: selectedAlert.timestamp
                  }}
                />
              </>
            ) : (
              <div className="wi-chat-empty">
                <div className="wi-chat-empty-icon">💬</div>
                <h3>No Alert Selected</h3>
                <p>Select a threat alert from Alerts Panel to begin AI-assisted analysis.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AlertDetailsToggle({ alert }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div style={{ marginBottom: "1rem", textAlign: "right" }}>
      {/* Removed Show Alert Details button */}
      {showDetails && (
        <div className="wi-alert-details-panel" style={{ border: "1px solid #444", borderRadius: 8, padding: 16, background: "#181c20", marginTop: 8, marginBottom: 8, maxWidth: 480, marginLeft: "auto", marginRight: 0 }}>
          <h3 style={{ marginTop: 0 }}>Alert Details</h3>
          <ul className="wi-alert-details-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li><b>Type:</b> {alert.type}</li>
            <li><b>Severity:</b> {alert.severityLevel || 'N/A'}</li>
            <li><b>Signal:</b> {alert.signal} dBm</li>
            <li><b>Source MAC:</b> {alert.source_mac}</li>
            <li><b>Dest MAC:</b> {alert.dest_mac}</li>
            <li><b>BSSID:</b> {alert.bssid}</li>
            <li><b>Channel:</b> {alert.channel}</li>
            <li><b>Timestamp:</b> {new Date(alert.timestamp).toLocaleString()}</li>
            <li><b>MITRE:</b> {alert.mitre?.technique_id || 'N/A'} {alert.mitre?.name ? `- ${alert.mitre.name}` : ''}</li>
            <li><b>Description:</b> {alert.text}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
