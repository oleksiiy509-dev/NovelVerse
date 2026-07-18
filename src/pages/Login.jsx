import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signUp() {
    if (!username.trim()) {
      alert("Введіть ім'я користувача.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: data.user.id,
          username,
        });

      if (profileError) {
        console.error(profileError);
      }
    }

    alert("Реєстрація успішна!");
    navigate("/");
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Вхід успішний!");
    navigate("/");
  }

  return (
    <div
      style={{
        maxWidth: "420px",
        margin: "80px auto",
        padding: "30px",
        background: "#111827",
        borderRadius: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
        color: "white",
      }}
    >
      <h1 style={{ textAlign: "center" }}>
        🔐 Авторизація
      </h1>

      <input
        type="text"
        placeholder="Ім'я користувача"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid #374151",
        }}
      />

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid #374151",
        }}
      />

      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid #374151",
        }}
      />

      <button
        onClick={signIn}
        style={{
          padding: "12px",
          borderRadius: "8px",
          background: "#2563eb",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        Увійти
      </button>

      <button
        onClick={signUp}
        style={{
          padding: "12px",
          borderRadius: "8px",
          background: "#16a34a",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        Зареєструватися
      </button>

      <button
        onClick={() => navigate("/")}
        style={{
          padding: "12px",
          borderRadius: "8px",
          background: "#374151",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        ⬅ На головну
      </button>
    </div>
  );
}

export default Login;