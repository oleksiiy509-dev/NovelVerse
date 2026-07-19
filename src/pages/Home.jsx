import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTelegram, useTelegramMainButton } from "../hooks/useTelegram";

import SearchBar from "../components/SearchBar";
import CategoryTabs from "../components/CategoryTabs";
import NovelGrid from "../components/NovelGrid";
import ContinueReading from "../components/ContinueReading";
import defaultCover from "../assets/default-cover.svg";

import "../styles/Home.css";

function normalize(value = "") { return String(value).toLowerCase(); }
function byRecentUpdate(a, b) {
  const left = new Date(b.updated_at || b.created_at || 0).getTime() || b.id || 0;
  const right = new Date(a.updated_at || a.created_at || 0).getTime() || a.id || 0;
  return left - right;
}
function relativeTime(value) {
  const date = new Date(value || Date.now());
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  const units = [["р", 31536000], ["міс", 2592000], ["д", 86400], ["год", 3600], ["хв", 60]];
  const unit = units.find(([, size]) => seconds >= size);
  if (!unit) return "щойно";
  return `${Math.floor(seconds / unit[1])} ${unit[0]} тому`;
}
function splitPills(value = "") { return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 3); }

function TopCarousel({ novels, loading, onOpen }) {
  if (loading) return <div className="top-carousel">{Array.from({ length: 4 }).map((_, i) => <div className="top-card top-card--skeleton skeleton" key={i} />)}</div>;
  if (!novels.length) return <div className="home-empty">Топ тижня зʼявиться після перших переглядів.</div>;
  return <div className="top-carousel" aria-label="Top of the Week">{novels.map((novel) => (
    <button className="top-card" key={novel.id} onClick={() => onOpen(novel.id)}>
      <img src={novel.image || defaultCover} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = defaultCover; }} />
      <span>{novel.title}</span>
    </button>
  ))}</div>;
}

function LatestUpdates({ novels, loading, error, onOpen }) {
  if (loading) return <div className="updates-list">{Array.from({ length: 5 }).map((_, i) => <div className="update-row update-row--skeleton skeleton" key={i} />)}</div>;
  if (error) return <div className="error-state">{error}</div>;
  if (!novels.length) return <div className="home-empty">Поки немає оновлень. Нові глави зʼявляться тут.</div>;
  return <div className="updates-list">{novels.map((novel, index) => (
    <button className="update-row" key={novel.id} onClick={() => onOpen(novel.id)}>
      <span className="update-row__rank">{index + 1}</span>
      <img src={novel.image || defaultCover} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = defaultCover; }} />
      <span className="update-row__body"><strong>{novel.title}</strong><span>{splitPills(novel.genres).join(" • ") || novel.status || "Novel"}</span></span>
      <time>{relativeTime(novel.updated_at || novel.created_at)}</time>
    </button>
  ))}</div>;
}

function Home() {
  const navigate = useNavigate();
  const [novels, setNovels] = useState([]);
  const [user, setUser] = useState(null);
  const { user: telegramUser } = useTelegram();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Усі");
  const [sort, setSort] = useState("default");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useTelegramMainButton({ text: user ? "Open profile" : "Sign in", onClick: () => navigate(user ? "/profile" : "/login") });
  useEffect(() => { loadNovels(); supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  async function loadNovels() {
    setLoading(true); setErrorMessage("");
    const { data, error } = await supabase.from("novels").select("*").order("id");
    if (error) { console.log(error); setErrorMessage(error.message || "Перевірте підключення."); setLoading(false); return; }
    setNovels(data || []); setLoading(false);
  }
  const categories = useMemo(() => { const values = new Set(["Усі"]); novels.forEach((novel) => [novel.status, ...(novel.genres || "").split(",")].map((item) => item?.trim()).filter(Boolean).forEach((item) => values.add(item))); return [...values]; }, [novels]);
  const filteredNovels = useMemo(() => {
    const query = normalize(search); let result = [...novels];
    if (query) result = result.filter((novel) => [novel.title, novel.author, novel.genres].some((value) => normalize(value).includes(query)));
    if (category !== "Усі") result = result.filter((novel) => [novel.status, novel.genres].some((value) => normalize(value).includes(normalize(category))));
    switch (sort) { case "rating": result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break; case "views": result.sort((a, b) => (b.views || 0) - (a.views || 0)); break; case "bookmarks": result.sort((a, b) => (b.bookmarks || 0) - (a.bookmarks || 0)); break; case "new": result.sort((a, b) => b.id - a.id); break; default: break; }
    return result;
  }, [novels, search, category, sort]);
  const latest = useMemo(() => [...novels].sort(byRecentUpdate).slice(0, 8), [novels]);
  const top = useMemo(() => [...novels].sort((a, b) => (b.bookmarks || 0) - (a.bookmarks || 0) || (b.views || 0) - (a.views || 0) || (b.rating || 0) - (a.rating || 0)).slice(0, 10), [novels]);

  return <div className="home page-shell">
    <header className="home__compact-header"><div><p className="home__eyebrow">NovelVerse</p><h1>Читайте далі</h1>{telegramUser && <small>Привіт, {telegramUser.first_name}</small>}</div><button onClick={() => navigate(user ? "/profile" : "/login")} aria-label="Профіль">👤</button></header>
    <SearchBar value={search} onChange={setSearch} />
    <CategoryTabs active={category} onChange={setCategory} categories={categories} />
    {!search && category === "Усі" && sort === "default" && <><ContinueReading /><section className="home__section"><div className="home__section-heading"><div><p className="home__eyebrow">Top of the Week</p><h2>Топ тижня</h2></div></div><TopCarousel novels={top} loading={loading} onOpen={(novelId) => navigate(`/novel/${novelId}`)} /></section><section className="home__section home__section--latest"><div className="home__section-heading"><div><p className="home__eyebrow">Fresh chapters</p><h2>Latest Updates</h2></div></div><LatestUpdates novels={latest} loading={loading} error={errorMessage} onOpen={(novelId) => navigate(`/novel/${novelId}`)} /></section></>}
    <div className="home__sorts"><button onClick={() => setSort("default")}>Усі</button><button onClick={() => setSort("rating")}>⭐ Рейтинг</button><button onClick={() => setSort("views")}>🔥 Популярні</button><button onClick={() => setSort("bookmarks")}>❤️ Збережені</button><button onClick={() => setSort("new")}>🆕 Новинки</button></div>
    <section className="home__section" id="catalog"><div className="home__section-heading"><div><p className="home__eyebrow">Browse</p><h2>Каталог</h2></div><span>{filteredNovels.length} новел</span></div><NovelGrid novels={filteredNovels} loading={loading} error={errorMessage} /></section>
  </div>;
}
export default Home;
