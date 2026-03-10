import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== "undefined") {
      console.error("[ERROR_BOUNDARY]", error, info);
    }
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Erreur inconnue.";
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ margin: 0, fontSize: 20, color: "#b91c1c" }}>
            Une erreur est survenue
          </h1>
          <p style={{ marginTop: 8, color: "#7f1d1d" }}>{message}</p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Recharger l'application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
