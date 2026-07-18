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
      *,
      novels (
        title
      )
    `)
    .order("novel_id")
    .order("number");

  if (error) {
    console.log(error);
    return;
  }

  console.log(data);

  setChapters(data);
}

  async function deleteChapter(id) {
    if (!window.confirm("Видалити главу?")) return;

    await supabase
      .from("chapters")
      .delete()
      .eq("id", id);

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
        }}
      >
        ➕ Додати главу
      </button>

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

          <p>📚 Новела: {chapter.novels?.title}</p>

          <p>📄 Глава №{chapter.number}</p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button>
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