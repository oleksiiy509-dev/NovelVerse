import { useNavigate } from "react-router-dom";
import "../styles/AdminPanel.css";

function Admin() {
  const navigate = useNavigate();
  const cards = [
    ["📚 Новели", "Створення, редагування, пошук і фільтри", "/admin/novels"],
    ["📖 Глави", "Керування розділами та rich text контентом", "/admin/chapters"],
    ["🏷️ Категорії й теги", "Окремий довідник категорій та тегів", "/admin/taxonomy"],
    ["➕ Додати новелу", "Швидке створення з обкладинкою", "/admin/novels/add"],
  ];
  return <main className="admin-shell">
    <div className="admin-header"><div><h1>⚙️ Панель адміністратора</h1><p className="admin-muted">Повний центр керування контентом NovelVerse.</p></div><button className="admin-secondary" onClick={() => navigate("/")}>На сайт</button></div>
    <section className="admin-grid">{cards.map(([title, text, href]) => <article className="admin-stat" key={href}><h2>{title}</h2><p className="admin-muted">{text}</p><button onClick={() => navigate(href)}>Відкрити</button></article>)}</section>
  </main>;
}
export default Admin;
