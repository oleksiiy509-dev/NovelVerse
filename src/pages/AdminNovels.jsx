import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function AdminNovels() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);

  useEffect(() => {
    loadNovels();
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

  async function deleteNovel(id) {
    const ok = window.confirm("Видалити цю новелу?");

    if (!ok) return;

    const { error } = await supabase
      .from("novels")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadNovels();
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
      <h1>📚 Керування новелами</h1>

      <button
        onClick={() => navigate("/admin/novels/add")}
        style={{
          marginBottom: "25px",
          padding: "12px 20px",
          borderRadius: "10px",
          border: "none",
          cursor: "pointer",
          fontSize: "16px",
        }}
      >
        ➕ Додати новелу
      </button>

      {novels.length === 0 && (
        <p>У базі поки що немає новел.</p>
      )}

      {novels.map((novel) => (
        <div
          key={novel.id}
          style={{
            background: "#1f2937",
            padding: "20px",
            borderRadius: "12px",
            marginBottom: "15px",
          }}
        >
          <h2>{novel.title}</h2>

          <p>
            <strong>Автор:</strong> {novel.author}
          </p>

          <p>
            <strong>Рейтинг:</strong> ⭐ {novel.rating}
          </p>

          <p>
            <strong>Глав:</strong> 📖 {novel.chapters}
          </p>

          <p>{novel.description}</p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "15px",
            }}
          >
            <button
              onClick={() => alert("Редагування буде на наступному кроці")}
            >
              ✏️ Редагувати
            </button>

            <button
              onClick={() => deleteNovel(novel.id)}
            >
              🗑️ Видалити
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AdminNovels;