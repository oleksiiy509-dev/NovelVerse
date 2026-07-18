import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function EditChapter() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapter();
  }, []);

  async function loadChapter() {
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setTitle(data.title);
    setNumber(data.number);
    setContent(data.content);
    setLoading(false);
  }

  async function updateChapter(e) {
    e.preventDefault();

    const { error } = await supabase
      .from("chapters")
      .update({
        title,
        number: Number(number),
        content,
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Глава успішно оновлена!");
    navigate("/admin/chapters");
  }

  if (loading) {
    return (
      <div style={{ color: "white", padding: "30px" }}>
        Завантаження...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "30px auto",
        color: "white",
        padding: "20px",
      }}
    >
      <h1>✏️ Редагування глави</h1>

      <form onSubmit={updateChapter}>
        <input
          type="text"
          placeholder="Назва глави"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
          }}
          required
        />

        <input
          type="number"
          placeholder="Номер глави"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
          }}
          required
        />

        <textarea
          placeholder="Текст глави"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "20px",
          }}
          required
        />

        <button
          type="submit"
          style={{
            padding: "12px 25px",
            cursor: "pointer",
          }}
        >
          💾 Зберегти
        </button>
      </form>
    </div>
  );
}

export default EditChapter;