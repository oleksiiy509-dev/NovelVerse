import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function AddNovel() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState("");
  const [chapters, setChapters] = useState("");
  const [coverFile, setCoverFile] = useState(null);

  const [genres, setGenres] = useState("");
  const [status, setStatus] = useState("Ongoing");
  const [views, setViews] = useState(0);
  const [bookmarks, setBookmarks] = useState(0);

  async function saveNovel() {
    let imageUrl = "";

    if (coverFile) {
      const fileName = `${Date.now()}-${coverFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(fileName, coverFile);

      if (uploadError) {
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage
        .from("covers")
        .getPublicUrl(fileName);

      imageUrl = data.publicUrl;
    }

    const { error } = await supabase.from("novels").insert({
      title,
      author,
      description,
      rating: Number(rating),
      chapters: Number(chapters),
      image: imageUrl,
      genres,
      status,
      views: Number(views),
      bookmarks: Number(bookmarks),
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Новелу успішно додано!");
    navigate("/admin/novels");
  }

  return (
    <div
      style={{
        maxWidth: "700px",
        margin: "30px auto",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
      }}
    >
      <h1>➕ Додати новелу</h1>

      <input
        placeholder="Назва"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        placeholder="Автор"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
      />

      <textarea
        rows={6}
        placeholder="Опис"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        placeholder="Жанри (Fantasy, Action, Adventure)"
        value={genres}
        onChange={(e) => setGenres(e.target.value)}
      />

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="Ongoing">Ongoing</option>
        <option value="Completed">Completed</option>
      </select>

      <input
        type="number"
        placeholder="Перегляди"
        value={views}
        onChange={(e) => setViews(Number(e.target.value))}
      />

      <input
        type="number"
        placeholder="Закладки"
        value={bookmarks}
        onChange={(e) => setBookmarks(Number(e.target.value))}
      />

      <input
        type="number"
        placeholder="Рейтинг"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
      />

      <input
        type="number"
        placeholder="Кількість глав"
        value={chapters}
        onChange={(e) => setChapters(e.target.value)}
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setCoverFile(e.target.files[0])}
      />

      <button
        onClick={saveNovel}
        style={{
          padding: "12px",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        💾 Зберегти
      </button>
    </div>
  );
}

export default AddNovel;