import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function AdminChapters() {
  const navigate = useNavigate();
  const [chapters, setChapters] = useState([]);

  useEffect(() => {
    loadChapters();
  }, []);

  async function loadChapters() {
    const { data, error } = await supabase
      .from("chapters")
      .select(`
        id,
        novel_id,
        number,
        title,
        content,
        novels:chapters_novel_id_fkey (
          id,
          title
        )
      `)
      .order("novel_id", { ascending: true })
      .order("number", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }
console.log(data);
    setChapters(data);
  }

  async function deleteChapter(id) {
    if (!window.confirm("Видалити главу?")) return;

    const { error } = await supabase
      .from("chapters")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadChapters();
  }

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "30px auto",
        color: "white",
        padding: "20px",
      }}
    >
      <h1>📖 Глави</h1>

      <button
        onClick={() => navigate("/admin/chapters/add")}
        style={{
          marginBottom: "20px",
          padding: "10px 20px",
          cursor: "pointer",
        }}
      >
        ➕ Додати главу
      </button>

      {chapters.length === 0 && <p>Глав поки немає.</p>}

      {chapters.map((chapter) => (
        <div
          key={chapter.id}
          style={{
            background: "#1e293b",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "10px",
          }}
        >
          <h3>{chapter.title}</h3>

          <p>
            📚 Новела:{" "}
            <strong>{chapter.novels?.title || "Не знайдено"}</strong>
          </p>

          <p>📄 Глава №{chapter.number}</p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button
              onClick={() =>
                navigate(`/admin/chapters/edit/${chapter.id}`)
              }
            >
              ✏️ Редагувати
            </button>

            <button
              onClick={() => deleteChapter(chapter.id)}
            >
              🗑 Видалити
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AdminChapters;