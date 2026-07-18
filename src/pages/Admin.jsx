import { useNavigate } from "react-router-dom";

function Admin() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "30px auto",
        padding: "20px",
        color: "white",
      }}
    >
      <h1>⚙️ Панель адміністратора</h1>

      <p
        style={{
          color: "#cbd5e1",
          marginBottom: "30px",
        }}
      >
        Ласкаво просимо до панелі керування NovelVerse.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
          gap: "20px",
        }}
      >
        <button
          onClick={() => navigate("/admin/novels")}
          style={buttonStyle}
        >
          📚 Новели
        </button>

        <button
          onClick={() => navigate("/admin/chapters")}
          style={buttonStyle}
        >
          📖 Глави
        </button>

        <button
          onClick={() => navigate("/admin/novels/add")}
          style={buttonStyle}
        >
          ➕ Додати новелу
        </button>

        <button
          onClick={() => navigate("/admin/chapters/add")}
          style={buttonStyle}
        >
          ➕ Додати главу
        </button>

        <button
          style={buttonStyle}
          onClick={() => alert("Незабаром")}
        >
          👥 Користувачі
        </button>

        <button
          style={buttonStyle}
          onClick={() => alert("Незабаром")}
        >
          📊 Статистика
        </button>

        <button
          style={buttonStyle}
          onClick={() => alert("Незабаром")}
        >
          ⚙️ Налаштування
        </button>

        <button
          style={buttonStyle}
          onClick={() => navigate("/")}
        >
          🏠 На головну
        </button>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: "20px",
  fontSize: "18px",
  borderRadius: "14px",
  border: "none",
  cursor: "pointer",
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
};

export default Admin;