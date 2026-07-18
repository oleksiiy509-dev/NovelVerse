import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [libraryCount, setLibraryCount] = useState(0);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      navigate("/login");
      return;
    }

    setUser(user);

    const { count } = await supabase
      .from("library")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setLibraryCount(count || 0);
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div
      style={{
        maxWidth: "500px",
        margin: "40px auto",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <h1>👤 Профіль</h1>

      <div
        style={{
          background: "#1f2937",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h3>Email</h3>
        <p>{user?.email}</p>

        <h3>❤️ Моя бібліотека</h3>
        <p>{libraryCount} новел</p>
      </div>

      <button
        onClick={() => navigate("/library")}
        style={{
          padding: "14px",
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: "10px",
          cursor: "pointer",
        }}
      >
        📚 Відкрити бібліотеку
      </button>

      <button
        onClick={logout}
        style={{
          padding: "14px",
          background: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "10px",
          cursor: "pointer",
        }}
      >
        🚪 Вийти
      </button>
    </div>
  );
}

export default Profile;