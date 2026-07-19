import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { initTelegramMiniApp } from "../lib/userFeatures";

import SearchBar from "../components/SearchBar";
import CategoryTabs from "../components/CategoryTabs";
import NovelGrid from "../components/NovelGrid";

import "../styles/Home.css";

function normalize(value = "") {
  return String(value).toLowerCase();
}

function Home() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [user, setUser] = useState(null);
  const [telegramUser] = useState(() => initTelegramMiniApp()?.initDataUnsafe?.user || null);
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

      <div className="home__sorts">
        <button onClick={() => setSort("default")}>📚 Усі</button>
        <button onClick={() => setSort("rating")}>⭐ Рейтинг</button>
        <button onClick={() => setSort("views")}>🔥 Популярні</button>
        <button onClick={() => setSort("bookmarks")}>❤️ Збережені</button>
        <button onClick={() => setSort("new")}>🆕 Новинки</button>
      </div>

      <NovelGrid novels={filteredNovels} loading={loading} error={errorMessage} />
    </div>
  );
}

export default Home;
