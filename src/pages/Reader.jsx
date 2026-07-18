import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [chapter, setChapter] = useState(null);

  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem("readerFontSize")) || 20;
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("readerDarkMode") !== "false";
  });

  useEffect(() => {
    loadChapter();
  }, [id]);

  useEffect(() => {
    if (!chapter) return;

    const saved = localStorage.getItem(`scroll_${id}`);

    if (saved) {
      setTimeout(() => {
        window.scrollTo(0, Number(saved));
      }, 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [chapter, id]);

  useEffect(() => {
    function saveScroll() {
      localStorage.setItem(
        `scroll_${id}`,
        window.scrollY
      );
    }

    window.addEventListener("scroll", saveScroll);

    return () => {
      window.removeEventListener("scroll", saveScroll);
    };
  }, [id]);

  async function loadChapter() {
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setChapter(data);

    localStorage.setItem(
      `lastChapter_${data.novel_id}`,
      data.id
    );

    const readKey = `readChapters_${data.novel_id}`;

    const read = JSON.parse(
      localStorage.getItem(readKey) || "[]"
    );

    if (!read.includes(data.id)) {
      read.push(data.id);

      localStorage.setItem(
        readKey,
        JSON.stringify(read)
      );
    }
  }

  async function previousChapter() {
    if (!chapter) return;

    const { data } = await supabase
      .from("chapters")
      .select("id")
      .eq("novel_id", chapter.novel_id)
      .lt("number", chapter.number)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      navigate(`/reader/${data.id}`);
    }
  }

  async function nextChapter() {
    if (!chapter) return;

    const { data } = await supabase
      .from("chapters")
      .select("id")
      .eq("novel_id", chapter.novel_id)
      .gt("number", chapter.number)
      .order("number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      navigate(`/reader/${data.id}`);
    }
  }

  function changeFontSize(size) {
    setFontSize(size);
    localStorage.setItem(
      "readerFontSize",
      size
    );
  }

  function toggleDarkMode() {
    const value = !darkMode;

    setDarkMode(value);

    localStorage.setItem(
      "readerDarkMode",
      value
    );
  }

  if (!chapter) {
    return (
      <div
        style={{
          color: "white",
          padding: 30,
        }}
      >
        Завантаження...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "30px auto",
        padding: "20px",
        paddingBottom: "120px",
        minHeight: "100vh",
        background: darkMode
          ? "#111827"
          : "#ffffff",
        color: darkMode
          ? "#ffffff"
          : "#111827",
        transition: "0.3s",
      }}
    >      <button
        onClick={() => navigate(`/novel/${chapter.novel_id}`)}
        style={{
          marginBottom: "20px",
          padding: "10px 18px",
          cursor: "pointer",
        }}
      >
        ⬅ До списку глав
      </button>

      <h1
        style={{
          marginBottom: "20px",
        }}
      >
        Глава {chapter.number}: {chapter.title}
      </h1>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "30px",
        }}
      >
        <button onClick={() => changeFontSize(16)}>
          A-
        </button>

        <button onClick={() => changeFontSize(20)}>
          A
        </button>

        <button onClick={() => changeFontSize(24)}>
          A+
        </button>

        <button onClick={() => changeFontSize(28)}>
          A++
        </button>

        <button onClick={toggleDarkMode}>
          {darkMode
            ? "☀️ Світла тема"
            : "🌙 Темна тема"}
        </button>
      </div>

      <div
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: "2",
          fontSize: `${fontSize}px`,
          marginBottom: "40px",
        }}
      >
        {chapter.content}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "20px",
        }}
      >
        <button
          onClick={previousChapter}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          ⬅ Попередня
        </button>

        <button
          onClick={nextChapter}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          Наступна ➡
        </button>
      </div>
    </div>
  );
}

export default Reader;