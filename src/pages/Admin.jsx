import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "../styles/AdminPanel.css";

function Admin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ novels: 0, chapters: 0, views: 0, bookmarks: 0 });
  useEffect(() => { async function loadStats() { const [{ data: novels = [] }, { count: chapters = 0 }] = await Promise.all([supabase.from("novels").select("views,bookmarks"), supabase.from("chapters").select("id", { count: "exact", head: true })]); setStats({ novels: novels.length, chapters, views: novels.reduce((sum, novel) => sum + (novel.views || 0), 0), bookmarks: novels.reduce((sum, novel) => sum + (novel.bookmarks || 0), 0) }); } loadStats(); }, []);
  const statCards = useMemo(() => [["Новел", stats.novels], ["Глав", stats.chapters], ["Переглядів", stats.views], ["Закладок", stats.bookmarks]], [stats]);
  const cards = [
    ["📚 Новели", "Створення, редагування, пошук і фільтри", "/admin/novels"],
    ["📖 Глави", "Керування розділами та rich text контентом", "/admin/chapters"],
    ["🏷️ Категорії й теги", "Окремий довідник категорій та тегів", "/admin/taxonomy"],
    ["➕ Додати новелу", "Швидке створення з обкладинкою", "/admin/novels/add"],
  ];
  return <main className="admin-shell">
    <div className="admin-header"><div><h1>⚙️ Панель адміністратора</h1><p className="admin-muted">Повний центр керування контентом NovelVerse.</p></div><button className="admin-secondary" onClick={() => navigate("/")}>На сайт</button></div>
    <section className="admin-stats-row" aria-label="Статистика новел">{statCards.map(([label, value]) => <article className="admin-stat admin-stat--compact" key={label}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></article>)}</section>
    <section className="admin-grid">{cards.map(([title, text, href]) => <article className="admin-stat" key={href}><h2>{title}</h2><p className="admin-muted">{text}</p><button onClick={() => navigate(href)}>Відкрити</button></article>)}</section>
  </main>;
}
export default Admin;
