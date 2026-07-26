import { Component } from "react";
import { Link } from "react-router-dom";
import { diagnosticLogger } from "../lib/diagnosticLogger";

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    diagnosticLogger.error("render", "Application error boundary caught an error", { error });
    this.heading?.focus();
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
