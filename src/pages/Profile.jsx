import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, readList, userKey } from "../lib/userFeatures";
import { useTelegram } from "../hooks/useTelegram";

function Profile() {
  const navigate = useNavigate();
  const { isTelegram, user: telegramUser, localUser } = useTelegram();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: "", avatar_url: "" });
  const [libraryCount, setLibraryCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const user = await getCurrentUser(supabase);
    if (!user) {
      navigate("/login");
      return;
    }

    setUser(user);
    setProfile({
      username: user.user_metadata?.username || user.email?.split("@")[0] || "Reader",
      avatar_url: user.user_metadata?.avatar_url || "",
    });

    const { count } = user.app_metadata?.provider === "telegram" ? { count: readList(userKey(user.id, "library")).length } : await supabase
      .from("library")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setLibraryCount(count || 0);
    setHistoryCount(readList(userKey(user.id, "history")).length);
  }

  async function saveProfile() {
    if (!user) return;
    const payload = { id: user.id, username: profile.username, avatar_url: profile.avatar_url };
    if (user.app_metadata?.provider === "telegram") {
      localStorage.setItem(userKey(user.id, "profile"), JSON.stringify(payload));
      setUser({ ...user, user_metadata: { ...user.user_metadata, ...profile } });
      alert("Telegram профіль збережено локально.");
      return;
    }
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      alert(error.message);
      return;
    }
    const nextUser = { ...user, user_metadata: { ...user.user_metadata, ...profile } };
    localStorage.setItem("supabase_user", JSON.stringify(nextUser));
    setUser(nextUser);
    alert("Профіль збережено.");
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div style={{ maxWidth: "720px", margin: "40px auto", color: "white", display: "flex", flexDirection: "column", gap: "20px", padding: 20 }}>
      <h1>👤 Профіль</h1>
      <div style={{ background: "#1f2937", padding: "20px", borderRadius: "16px", display: "grid", gap: 16 }}>
        <img src={profile.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(profile.username || "NovelVerse")}`} alt="Аватар" style={{ width: 104, height: 104, borderRadius: "50%", background: "#0f172a" }} />
        {isTelegram && telegramUser && <p>📱 Telegram: @{telegramUser.username || localUser?.user_metadata?.username} · ID {telegramUser.id}</p>}
        <label>Ім'я користувача<input value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label>
        <label>URL аватара<input value={profile.avatar_url} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })} placeholder="https://..." /></label>
        <p>Email: {user?.email}</p>
        <p>❤️ Моя бібліотека: {libraryCount} новел</p>
        <p>🕘 Історія читання: {historyCount} записів</p>
        <button onClick={saveProfile}>💾 Зберегти профіль</button>
      </div>
      <button onClick={() => navigate("/library")}>📚 Відкрити бібліотеку</button>
      <button onClick={() => navigate("/admin")}>⚙️ Адмін-панель</button>
      <button onClick={logout} style={{ background: "#dc2626" }}>🚪 Вийти</button>
    </div>
  );
}

export default Profile;
