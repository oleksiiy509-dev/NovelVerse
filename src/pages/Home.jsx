import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTelegram, useTelegramMainButton } from "../hooks/useTelegram";

import SearchBar from "../components/SearchBar";
import CategoryTabs from "../components/CategoryTabs";
import NovelGrid from "../components/NovelGrid";
import ContinueReading from "../components/ContinueReading";

import "../styles/Home.css";

function normalize(value = "") {
  return String(value).toLowerCase();
}

function byRecentUpdate(a, b) {
  const left = new Date(b.updated_at || b.created_at || 0).getTime() || b.id || 0;
  const right = new Date(a.updated_at || a.created_at || 0).getTime() || a.id || 0;
  return left - right;
}

function Home() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [user, setUser] = useState(null);
  const { user: telegramUser } = useTelegram();

  useTelegramMainButton({
    text: user ? "Open profile" : "Sign in",
    onClick: () => navigate(user ? "/profile" : "/login"),
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Усі");
  const [sort, setSort] = useState("default");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadNovels();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  async function loadNovels() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("novels")
      .select("*")
      .order("id");

    if (error) {
      console.log(error);
      setErrorMessage(error.message || "Перевірте підключення.");
      setLoading(false);
      return;
    }

    setNovels(data || []);
    setLoading(false);
  }

  const categories = useMemo(() => {
    const values = new Set(["Усі"]);
    novels.forEach((novel) => {
      [novel.status, ...(novel.genres || "").split(",")]
        .map((item) => item?.trim())
        .filter(Boolean)
        .forEach((item) => values.add(item));
    });
    return [...values];
  }, [novels]);

  const filteredNovels = useMemo(() => {
    const query = normalize(search);
    let result = [...novels];

    if (query) {
      result = result.filter((novel) =>
        [novel.title, novel.author, novel.genres]
          .some((value) => normalize(value).includes(query))
      );
    }

    if (category !== "Усі") {
      result = result.filter((novel) =>
        [novel.status, novel.genres]
          .some((value) => normalize(value).includes(normalize(category)))
      );
    }

    switch (sort) {
      case "rating":
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "views":
        result.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case "bookmarks":
        result.sort((a, b) => (b.bookmarks || 0) - (a.bookmarks || 0));
        break;
      case "new":
        result.sort((a, b) => b.id - a.id);
        break;
      default:
        break;
    }

    return result;
  }, [novels, search, category, sort]);

  const recentlyUpdated = useMemo(() => [...novels].sort(byRecentUpdate).slice(0, 6), [novels]);
  const popularNovels = useMemo(() => [...novels].sort((a, b) => (b.views || 0) - (a.views || 0) || (b.rating || 0) - (a.rating || 0)).slice(0, 6), [novels]);

  return (
    <div className="home page-shell">
      <div className="home__hero">
        <div>
          <p className="home__eyebrow">Production novel platform</p>
          <h1>📚 NovelVerse</h1>
          <p>Читайте онлайн, продовжуйте з будь-якого пристрою та зберігайте глави офлайн.</p>
          {telegramUser && <small>Telegram Mini App: {telegramUser.first_name}</small>}
        </div>

        <button onClick={() => navigate(user ? "/profile" : "/login")}>
          {user ? "👤 Профіль" : "🔐 Увійти"}
        </button>
      </div>

      <SearchBar value={search} onChange={setSearch} />

      <CategoryTabs active={category} onChange={setCategory} categories={categories} />

      {!search && category === "Усі" && sort === "default" && (
        <>
          <ContinueReading />
          <section className="home__section" aria-labelledby="recently-updated-title">
            <div className="home__section-heading"><div><p className="home__eyebrow">Fresh chapters</p><h2 id="recently-updated-title">Нещодавно оновлені</h2></div></div>
            <NovelGrid novels={recentlyUpdated} loading={loading} error={errorMessage} emptyTitle="Поки немає оновлень" emptyText="Коли новели отримають нові глави, вони зʼявляться тут." />
          </section>
          <section className="home__section" aria-labelledby="popular-title">
            <div className="home__section-heading"><div><p className="home__eyebrow">Community picks</p><h2 id="popular-title">Популярні новели</h2></div></div>
            <NovelGrid novels={popularNovels} loading={loading} error={errorMessage} emptyTitle="Популярні новели ще формуються" emptyText="Перегляди, рейтинг і закладки допоможуть наповнити цю секцію." />
          </section>
        </>
      )}

      <div className="home__sorts">
        <button onClick={() => setSort("default")}>📚 Усі</button>
        <button onClick={() => setSort("rating")}>⭐ Рейтинг</button>
        <button onClick={() => setSort("views")}>🔥 Популярні</button>
        <button onClick={() => setSort("bookmarks")}>❤️ Збережені</button>
        <button onClick={() => setSort("new")}>🆕 Новинки</button>
      </div>

      <section className="home__section" aria-labelledby="catalog-title">
        <div className="home__section-heading"><div><p className="home__eyebrow">Browse</p><h2 id="catalog-title">Каталог</h2></div><span>{filteredNovels.length} новел</span></div>
        <NovelGrid novels={filteredNovels} loading={loading} error={errorMessage} />
      </section>
    </div>
  );
}

export default Home;
