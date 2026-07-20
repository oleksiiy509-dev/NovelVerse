import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, readList, userKey } from "../lib/userFeatures";
import { useTelegram } from "../hooks/useTelegram";
import "../styles/Profile.css";

function Profile() {
  const navigate = useNavigate();
  const { isTelegram, user: telegramUser, localUser } = useTelegram();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: "", avatar_url: "" });
  const [libraryCount, setLibraryCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      const user = await getCurrentUser(supabase);
      if (!user) {
        navigate("/login");
        return;
      }

      const { count } = user.app_metadata?.provider === "telegram" ? { count: readList(userKey(user.id, "library")).length } : await supabase
        .from("library")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (ignore) return;

      setUser(user);
      setProfile({
        username: user.user_metadata?.username || user.email?.split("@")[0] || "Reader",
        avatar_url: user.user_metadata?.avatar_url || "",
      });
      setLibraryCount(count || 0);
      setHistoryCount(readList(userKey(user.id, "history")).length);
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, [navigate]);

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
    const { data: authData, error: authError } = await supabase.auth.updateUser({ data: profile });
    if (authError) {
      alert(authError.message);
      return;
    }
    const nextUser = authData.user || { ...user, user_metadata: { ...user.user_metadata, ...profile } };
    setUser(nextUser);
    alert("Профіль збережено.");
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  const avatarUrl = profile.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(profile.username || "NovelVerse")}`;

  return (
    <div className="profile-page page-shell">
      <h1>Профіль</h1>
      <div className="profile-card">
        <div className="profile-card__compact">
          <img src={avatarUrl} alt="Аватар" className="profile-card__avatar" />
          <div className="profile-card__name">
            <strong>{profile.username || "Reader"}</strong>
            <span>{isTelegram ? `@${telegramUser?.username || localUser?.user_metadata?.username || "telegram"}` : user?.email}</span>
          </div>
          <button type="button" className="profile-card__settings" aria-label="Налаштування профілю" onClick={() => setShowSettings((value) => !value)}>⚙️</button>
        </div>

        {isTelegram && telegramUser && <p className="profile-card__telegram">📱 Telegram Mini App · ID {telegramUser.id}</p>}

        {showSettings && (
          <div className="profile-card__form">
            <label>Ім'я користувача<input value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label>
            <label>URL аватара<input value={profile.avatar_url} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })} placeholder="https://..." /></label>
            <button onClick={saveProfile}>💾 Зберегти профіль</button>
          </div>
        )}

        <p className="profile-card__email">Email: {user?.email || "Telegram user"}</p>
        <div className="profile-card__stats">
          <span>❤️ Моя бібліотека: {libraryCount} новел</span>
          <span>🕘 Історія читання: {historyCount} записів</span>
        </div>
      </div>
      <div className="profile-actions">
        <button onClick={() => navigate("/library")}>📚 Відкрити бібліотеку</button>
        <button onClick={() => navigate("/admin")}>⚙️ Адмін-панель</button>
        <button onClick={logout} className="profile-actions__danger">🚪 Вийти</button>
      </div>
    </div>
  );
}

export default Profile;
