import { Component } from "react";
import { Link } from "react-router-dom";
import { diagnosticLogger } from "../lib/diagnosticLogger";

class ErrorBoundary extends Component {
  state = { hasError: false, errorId: null };

  static getDerivedStateFromError() {
    return { hasError: true, errorId: `render-${Date.now().toString(36)}` };
  }

  componentDidCatch(error, info) {
    diagnosticLogger.error("render", "Application error boundary caught an error", { error, componentStack: info?.componentStack, errorId: this.state.errorId });
    this.heading?.focus();
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) this.setState({ hasError: false, errorId: null });
  }

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="page-shell error-boundary" role="alert">
        <p className="home__eyebrow">NovelVerse</p>
        <h1 tabIndex="-1" ref={(node) => { this.heading = node; }}>Щось пішло не так</h1>
        <p>Сторінка тимчасово недоступна. Спробуйте оновити її. Якщо помилка повторюється, відкрийте Diagnostics та експортуйте безпечний звіт.</p>
        <p className="admin-muted">Код помилки: {this.state.errorId}</p>
        <div className="error-boundary__actions">
          <button type="button" onClick={this.reload}>Оновити</button>
          <Link to="/beta">Diagnostics</Link>
          <Link to="/">На головну</Link>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
