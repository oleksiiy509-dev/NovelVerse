import { Component } from "react";
import { Link } from "react-router-dom";

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Application error boundary caught an error.", error);
  }

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="page-shell error-boundary" role="alert">
        <p className="home__eyebrow">NovelVerse</p>
        <h1>Щось пішло не так</h1>
        <p>Сторінка тимчасово недоступна. Оновіть застосунок або поверніться на головну.</p>
        <div className="error-boundary__actions">
          <button type="button" onClick={this.reload}>Оновити</button>
          <Link to="/">На головну</Link>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
