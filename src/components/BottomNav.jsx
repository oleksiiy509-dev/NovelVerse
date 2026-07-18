import { Link } from "react-router-dom";
import "./BottomNav.css";
function BottomNav() {
  return (
    <nav className="bottom-nav">
      <Link to="/">🏠<br />Головна</Link>
      <Link to="/library">📚<br />Бібліотека</Link>
      <Link to="/reader">📖<br />Читати</Link>
      <Link to="/profile">👤<br />Профіль</Link>
    </nav>
  );
}

export default BottomNav;