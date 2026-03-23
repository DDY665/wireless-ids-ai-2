import { useState } from "react";
import AlertChat from "./AlertChat";
import { withSecurityHeaders } from "../src/apiSecurity";

function AlertCard({ alert }) {
  const [status, setStatus] = useState(alert.status || "new");
  const [analystNotes, setAnalystNotes] = useState(alert.analystNotes || "");
  const [notesEditing, setNotesEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showCorrelatedAlerts, setShowCorrelatedAlerts] = useState(false);
  const [correlatedAlerts, setCorrelatedAlerts] = useState([]);
  const [loadingCorrelated, setLoadingCorrelated] = useState(false);

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    await updateAlert(newStatus, analystNotes);
  };

  const handleNotesSave = async () => {
    await updateAlert(status, analystNotes);
    setNotesEditing(false);
  };

  const updateAlert = async (newStatus, newNotes) => {
    try {
      setUpdating(true);
      const res = await fetch(`http://localhost:5000/alerts/${alert._id}/status`, {
        method: "PATCH",
        headers: withSecurityHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          status: newStatus,
          notes: newNotes
        })
      });
      if (!res.ok) {
        throw new Error("Failed to update alert");
      }
    } catch (err) {
      console.error("Error updating alert:", err);
      // Revert on error
      setStatus(alert.status || "new");
    } finally {
      setUpdating(false);
    }
  };

  const loadCorrelatedAlerts = async () => {
    if (showCorrelatedAlerts) {
      setShowCorrelatedAlerts(false);
      return;
    }

    try {
      setLoadingCorrelated(true);
      const res = await fetch(`http://localhost:5000/alerts/${alert._id}/correlation`, {
        headers: withSecurityHeaders()
      });
      if (!res.ok) {
        throw new Error("Failed to load correlated alerts");
      }
      const data = await res.json();
      setCorrelatedAlerts(data.alerts || []);
      setShowCorrelatedAlerts(true);
    } catch (err) {
      console.error("Error loading correlated alerts:", err);
    } finally {
      setLoadingCorrelated(false);
    }
  };

  return (
    <div style={styles.alertCard}>
      <div style={styles.alertHeader}>
        <div style={styles.alertTitleGroup}>
          <h3 style={styles.alertType}>{alert.type}</h3>
          {alert.correlationCount && alert.correlationCount > 1 && (
            <button
              onClick={loadCorrelatedAlerts}
              disabled={loadingCorrelated}
              style={{
                ...styles.correlationBadge,
                ...(showCorrelatedAlerts ? styles.correlationBadgeActive : {})
              }}
              title={`Part of ${alert.correlationCount} similar alerts`}
            >
              🔗 {alert.correlationCount}
            </button>
          )}
        </div>
        <span style={{ ...styles.severityBadge, ...getSeverityStyle(alert.severity?.level) }}>
          {alert.severity?.level?.toUpperCase() || "UNKNOWN"}
        </span>
      </div>

      <div style={styles.alertDetails}>
        <p><b>Signal:</b> {alert.signal} dBm</p>
        <p><b>Severity Score:</b> {alert.severity?.score || "N/A"}/100</p>
        <p><b>MITRE Technique:</b> {alert.mitre?.technique_id}</p>
        <p><b>Technique Name:</b> {alert.mitre?.name}</p>
      </div>

      {/* Correlated Alerts Panel */}
      {showCorrelatedAlerts && correlatedAlerts.length > 0 && (
        <div style={styles.correlatedPanel}>
          <h4 style={styles.correlatedTitle}>🔗 Correlated Alerts ({correlatedAlerts.length})</h4>
          <div style={styles.correlatedList}>
            {correlatedAlerts.map((correlated) => (
              <div key={correlated._id} style={styles.correlatedItem}>
                <span style={styles.correlatedTime}>
                  {new Date(correlated.timestamp).toLocaleTimeString()}
                </span>
                <span style={styles.correlatedMac}>
                  {correlated.source_mac} → {correlated.dest_mac}
                </span>
                <span style={{ ...styles.correlatedSignal, ...(correlated._id === alert._id ? styles.currentAlert : {}) }}>
                  {correlated.signal} dBm {correlated._id === alert._id && "← Current"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyst Controls */}
      <div style={styles.analystSection}>
        <div style={styles.statusControl}>
          <label style={styles.label}>Status:</label>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
            style={styles.statusSelect}
          >
            <option value="new">🟦 New</option>
            <option value="triaged">🟨 Triaged</option>
            <option value="investigating">🟦 Investigating</option>
            <option value="resolved">🟩 Resolved</option>
            <option value="false_positive">⚪ False Positive</option>
          </select>
        </div>

        <div style={styles.notesControl}>
          <label style={styles.label}>Analyst Notes:</label>
          {notesEditing ? (
            <div style={styles.notesEditContainer}>
              <textarea
                value={analystNotes}
                onChange={(e) => setAnalystNotes(e.target.value)}
                style={styles.notesTextarea}
                placeholder="Add triage notes, findings, or next steps..."
                disabled={updating}
              />
              <div style={styles.notesButtonGroup}>
                <button
                  onClick={handleNotesSave}
                  disabled={updating}
                  style={{ ...styles.notesButton, ...styles.saveButton }}
                >
                  ✓ Save
                </button>
                <button
                  onClick={() => {
                    setAnalystNotes(alert.analystNotes || "");
                    setNotesEditing(false);
                  }}
                  disabled={updating}
                  style={{ ...styles.notesButton, ...styles.cancelButton }}
                >
                  ✕ Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.notesDisplayContainer}>
              <div style={styles.notesDisplay}>
                {analystNotes || "<No notes added yet>"}
              </div>
              <button
                onClick={() => setNotesEditing(true)}
                disabled={updating}
                style={styles.editButton}
              >
                ✎ Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Interface */}
      <AlertChat alertId={alert._id} />
    </div>
  );
}

const getSeverityStyle = (level) => {
  const styles = {
    critical: { background: "#7f1d1d", color: "#fecaca", borderColor: "#991b1b" },
    high: { background: "#7f1d1d", color: "#fecaca", borderColor: "#991b1b" },
    medium: { background: "#713f12", color: "#fde68a", borderColor: "#a16207" },
    low: { background: "#1e3a8a", color: "#93c5fd", borderColor: "#1e40af" }
  };
  return styles[level] || styles.low;
};

const styles = {
  alertCard: {
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "12px",
    background: "#1e293b",
    color: "#e2e8f0"
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px"
  },
  alertTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  alertType: {
    margin: "0",
    fontSize: "18px",
    fontWeight: "700"
  },
  correlationBadge: {
    padding: "6px 12px",
    background: "#1e40af",
    color: "#dbeafe",
    border: "1px solid #3b82f6",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  correlationBadgeActive: {
    background: "#3b82f6",
    color: "#ffffff"
  },
  severityBadge: {
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid",
    letterSpacing: "0.3px"
  },
  alertDetails: {
    background: "#0f172a",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "12px",
    fontSize: "13px"
  },
  correlatedPanel: {
    background: "#0f172a",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "12px",
    border: "1px solid #1e40af"
  },
  correlatedTitle: {
    margin: "0 0 10px 0",
    fontSize: "12px",
    fontWeight: "700",
    color: "#93c5fd",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  correlatedList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "150px",
    overflowY: "auto"
  },
  correlatedItem: {
    display: "flex",
    gap: "12px",
    padding: "6px",
    background: "#1e293b",
    borderRadius: "4px",
    fontSize: "11px",
    alignItems: "center"
  },
  correlatedTime: {
    color: "#64748b",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace",
    minWidth: "50px"
  },
  correlatedMac: {
    color: "#cbd5e1",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace",
    flex: 1
  },
  correlatedSignal: {
    color: "#94a3b8",
    fontWeight: "600"
  },
  currentAlert: {
    color: "#86efac",
    fontWeight: "700"
  },
  analystSection: {
    background: "#0f172a",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "12px"
  },
  statusControl: {
    marginBottom: "12px"
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  statusSelect: {
    width: "100%",
    padding: "8px 12px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "14px",
    cursor: "pointer"
  },
  notesControl: {
    marginBottom: "0"
  },
  notesDisplay: {
    background: "#1e293b",
    padding: "10px",
    borderRadius: "4px",
    fontSize: "13px",
    lineHeight: "1.5",
    color: "#cbd5e1",
    minHeight: "40px",
    marginBottom: "8px",
    border: "1px solid #334155"
  },
  notesDisplayContainer: {
    display: "flex",
    flexDirection: "column"
  },
  notesEditContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
  notesTextarea: {
    width: "100%",
    padding: "10px",
    background: "#1e293b",
    border: "1px solid #3b82f6",
    borderRadius: "4px",
    color: "#e2e8f0",
    fontSize: "13px",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: "80px"
  },
  notesButtonGroup: {
    display: "flex",
    gap: "8px"
  },
  notesButton: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600"
  },
  saveButton: {
    background: "#10b981",
    color: "#ffffff"
  },
  cancelButton: {
    background: "#6b7280",
    color: "#ffffff"
  },
  editButton: {
    alignSelf: "flex-start",
    padding: "6px 12px",
    background: "#3b82f6",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600"
  }
};

export default AlertCard;