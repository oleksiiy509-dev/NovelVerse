import { Link, useNavigate } from "react-router-dom";
import "../styles/NotFound.css";

function NotFound() {
  const navigate = useNavigate();

  return (
    <main className="not-found page-shell">
      <section className="not-found__card" aria-labelledby="not-found-title">
        <p className="home__eyebrow">404</p>
        <h1 id="not-found-title">Сторінку не знайдено</h1>
        <p>Можливо, розділ було переміщено або посилання містить помилку.</p>
        <div className="not-found__actions">
          <Link to="/">На головну</Link>
          <button type="button" onClick={() => navigate(-1)}>Назад</button>
        </div>
      </section>
    </main>
  );
}

export default NotFound;
