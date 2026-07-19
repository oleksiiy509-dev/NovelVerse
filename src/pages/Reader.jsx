import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addReadingHistory, getOfflineChapter, getCurrentUser, saveOfflineChapter, syncReadingProgress, userKey, readList, writeList } from "../lib/userFeatures";

function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [chapter, setChapter] = useState(null);
  const [user, setUser] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem("readerFontSize")) || 20;
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("readerDarkMode") !== "false";
  });

  useEffect(() => {
    loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const progress = Math.min(100, Math.round((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100));
      localStorage.setItem(`scroll_${id}`, window.scrollY);
      if (chapter) syncReadingProgress(supabase, user, { novel_id: chapter.novel_id, chapter_id: chapter.id, scroll_y: window.scrollY, progress });
    }

    window.addEventListener("scroll", saveScroll);

    return () => {
      window.removeEventListener("scroll", saveScroll);
    };
  }, [id, chapter, user]);

  async function loadChapter() {
    const currentUser = await getCurrentUser(supabase);
    setUser(currentUser);
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", id)
      .single();

    const cached = getOfflineChapter(id);
    if (error && !cached) {
      console.error(error);
      return;
    }

    const activeChapter = data || cached;
    setChapter(activeChapter);
    setOfflineReady(!!cached);
    const bookmarks = readList(userKey(currentUser?.id, "bookmarks"));
    setBookmarked(bookmarks.some((item) => item.chapter_id === activeChapter.id));
    if (data) saveOfflineChapter(data);

    localStorage.setItem(
      `lastChapter_${activeChapter.novel_id}`,
      activeChapter.id
    );

    const readKey = `readChapters_${activeChapter.novel_id}`;

    const read = JSON.parse(
      localStorage.getItem(readKey) || "[]"
    );

    if (!read.includes(activeChapter.id)) {
      read.push(activeChapter.id);

      localStorage.setItem(
        readKey,
        JSON.stringify(read)
      );
    }

    await addReadingHistory(supabase, currentUser, {
      novel_id: activeChapter.novel_id,
      chapter_id: activeChapter.id,
      chapter_title: activeChapter.title,
    });
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



  async function toggleBookmark() {
    if (!chapter) return;
    const key = userKey(user?.id, "bookmarks");
    const bookmarks = readList(key);
    if (bookmarked) {
      writeList(key, bookmarks.filter((item) => item.chapter_id !== chapter.id));
      setBookmarked(false);
      if (user) await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("chapter_id", chapter.id);
      return;
    }
    const entry = { novel_id: chapter.novel_id, chapter_id: chapter.id, chapter_title: chapter.title, scroll_y: window.scrollY, created_at: new Date().toISOString() };
    writeList(key, [entry, ...bookmarks]);
    setBookmarked(true);
    if (user) await supabase.from("bookmarks").insert({ ...entry, user_id: user.id });
  }

  function cacheCurrentChapter() {
    saveOfflineChapter(chapter);
    setOfflineReady(true);
    alert("Главу збережено для офлайн-читання.");
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

        <button onClick={toggleBookmark}>{bookmarked ? "🔖 Закладку додано" : "🔖 Закладка"}</button>

        <button onClick={cacheCurrentChapter}>{offlineReady ? "✅ Офлайн" : "⬇️ Офлайн"}</button>

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