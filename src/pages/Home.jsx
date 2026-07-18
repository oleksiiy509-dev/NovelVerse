import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import SearchBar from "../components/SearchBar";
import CategoryTabs from "../components/CategoryTabs";
import NovelGrid from "../components/NovelGrid";

import "../styles/Home.css";

function Home() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [user, setUser] = useState(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Усі");
  const [sort, setSort] = useState("default");

  useEffect(() => {
    loadNovels();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  async function loadNovels() {
    const { data, error } = await supabase
      .from("novels")
      .select("*")
      .order("id");

    if (error) {
      console.log(error);
      return;
    }

    setNovels(data || []);
  }

  const filteredNovels = useMemo(() => {
    let result = [...novels];

    if (search) {
      result = result.filter(
        (novel) =>
          novel.title.toLowerCase().includes(search.toLowerCase()) ||
          novel.author.toLowerCase().includes(search.toLowerCase())
      );
    }

    switch (sort) {
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
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
    <div className="home">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1>📚 NovelVerse</h1>

        <button
          onClick={() =>
            navigate(user ? "/profile" : "/login")
          }
        >
          {user ? "👤 Профіль" : "🔐 Увійти"}
        </button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
      />

      <CategoryTabs
        active={category}
        onChange={setCategory}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          margin: "20px 0",
        }}
      >
        <button onClick={() => setSort("default")}>
          📚 Усі
        </button>

        <button onClick={() => setSort("rating")}>
          ⭐ Рейтинг
        </button>

        <button onClick={() => setSort("views")}>
          🔥 Популярні
        </button>

        <button onClick={() => setSort("bookmarks")}>
          ❤️ Збережені
        </button>

        <button onClick={() => setSort("new")}>
          🆕 Новинки
        </button>
      </div>

      <NovelGrid novels={filteredNovels} />
    </div>
  );
}

export default Home;