import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function Library() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLibrary();
  }, []);

  async function loadLibrary() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      navigate("/login");
      return;
    }

    const { data, error } = await supabase
      .from("library")
      .select(`
        id,
        novels (
          id,
          title,
          author,
          image,
          rating,
          chapters
        )
      `)
      .eq("user_id", user.id);

    if (error) {
      console.log(error);
      setLoading(false);
      return;
    }

    setNovels(data || []);
    setLoading(false);
  }

  async function removeFromLibrary(id) {
    const { error } = await supabase
      .from("library")
      .delete()
      .eq("id", id);

    if (!error) {
      loadLibrary();
    }
  }

  if (loading) {
    return (
      <div
        style={{
          color: "white",
          padding: "30px",
        }}
      >
        Завантаження...
      </div>
    );
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
      <h1>📚 Моя бібліотека</h1>

      {novels.length === 0 ? (
        <p>У бібліотеці поки немає новел.</p>
      ) : (
        novels.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              gap: "20px",
              background: "#1f2937",
              marginBottom: "20px",
              padding: "15px",
              borderRadius: "12px",
              alignItems: "center",
            }}
          >
            <img
              src={item.novels.image}
              alt={item.novels.title}
              style={{
                width: "90px",
                borderRadius: "10px",
              }}
            />

            <div style={{ flex: 1 }}>
              <h3>{item.novels.title}</h3>

              <p>✍️ {item.novels.author}</p>

              <p>⭐ {item.novels.rating}</p>

              <p>📖 {item.novels.chapters} глав</p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <button
                onClick={() =>
                  navigate(`/novel/${item.novels.id}`)
                }
              >
                📖 Відкрити
              </button>

              <button
                onClick={() =>
                  removeFromLibrary(item.id)
                }
              >
                🗑 Видалити
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default Library;