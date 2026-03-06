import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError() {
    // This method is called during the render phase, so side effects are not allowed
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an error:", error);
    console.error("Error Info:", errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <span style={styles.icon}>⚠️</span>
            </div>
            
            <h1 style={styles.title}>Oops! Something went wrong</h1>
            
            <p style={styles.message}>
              The application encountered an unexpected error.
            </p>

            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && (
                    <>
                      {"\n\nComponent Stack:"}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={this.handleReset}>
                🔄 Reload Application
              </button>
              <button 
                style={styles.secondaryButton}
                onClick={() => window.history.back()}
              >
                ← Go Back
              </button>
            </div>

            <p style={styles.footer}>
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif"
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "48px",
    maxWidth: "600px",
    width: "100%",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
    textAlign: "center"
  },
  iconContainer: {
    marginBottom: "24px"
  },
  icon: {
    fontSize: "64px",
    filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))"
  },
  title: {
    margin: "0 0 16px",
    fontSize: "28px",
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: "-0.5px"
  },
  message: {
    margin: "0 0 32px",
    fontSize: "16px",
    color: "#94a3b8",
    lineHeight: "1.6"
  },
  details: {
    marginBottom: "32px",
    textAlign: "left",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "16px"
  },
  summary: {
    cursor: "pointer",
    fontWeight: "600",
    color: "#60a5fa",
    marginBottom: "12px",
    fontSize: "14px"
  },
  errorText: {
    fontSize: "12px",
    color: "#fca5a5",
    fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace",
    overflow: "auto",
    maxHeight: "200px",
    lineHeight: "1.5",
    margin: 0
  },
  actions: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginBottom: "24px"
  },
  primaryButton: {
    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "transform 0.2s",
    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)"
  },
  secondaryButton: {
    background: "#334155",
    color: "#e2e8f0",
    border: "1px solid #475569",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  footer: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b"
  }
};

export default ErrorBoundary;
