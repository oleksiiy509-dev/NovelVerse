import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";

import BottomNav from "./components/BottomNav.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NetworkBanner from "./components/NetworkBanner.jsx";
import PageLoadingSkeleton from "./components/PageLoadingSkeleton.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import { useTelegramBackButton } from "./hooks/useTelegram";

const Home = lazy(() => import("./pages/Home.jsx"));
const Library = lazy(() => import("./pages/Library.jsx"));
const Catalog = lazy(() => import("./pages/Catalog.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Downloads = lazy(() => import("./pages/Downloads.jsx"));
const Reader = lazy(() => import("./pages/Reader.jsx"));
const Novel = lazy(() => import("./pages/Novel.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const AdminNovels = lazy(() => import("./pages/AdminNovels.jsx"));
const AddNovel = lazy(() => import("./pages/AddNovel.jsx"));
const EditNovel = lazy(() => import("./pages/EditNovel.jsx"));
const AdminChapters = lazy(() => import("./pages/AdminChapters.jsx"));
const AddChapter = lazy(() => import("./pages/AddChapter.jsx"));
const EditChapter = lazy(() => import("./pages/EditChapter.jsx"));
const AdminTaxonomy = lazy(() => import("./pages/AdminTaxonomy.jsx"));
const AdminCharacters = lazy(() => import("./pages/AdminCharacters.jsx"));
const AiBrainStudio = lazy(() => import("./pages/AiBrainStudio.jsx"));
const UniversalVoiceStudio = lazy(() => import("./pages/UniversalVoiceStudio.jsx"));
const AdminSceneStudio = lazy(() => import("./pages/AdminSceneStudio.jsx"));
const AiAudioStudio = lazy(() => import("./pages/AiAudioStudio.jsx"));
const NarrationStudio = lazy(() => import("./pages/NarrationStudio.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const BetaDashboard = lazy(() => import("./pages/BetaDashboard.jsx"));
const ExportStudio = lazy(() => import("./pages/ExportStudio.jsx"));
const PublishingStudio = lazy(() => import("./pages/PublishingStudio.jsx"));
const Subscription = lazy(() => import("./pages/Subscription.jsx"));
const SubscriptionAdmin = lazy(() => import("./pages/SubscriptionAdmin.jsx"));
const CreatorPortal = lazy(() => import("./pages/CreatorPortal.jsx"));
const LanguageDashboard = lazy(() => import("./pages/LanguageDashboard.jsx"));
const NovelVerseStudio = lazy(() => import("./pages/NovelVerseStudio.jsx"));

function AppRoutes() {
  useTelegramBackButton();

  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/novel/:id" element={<Novel />} />
        <Route path="/login" element={<Login />} />
        <Route path="/beta" element={<BetaDashboard />} />
        <Route element={<ProtectedAdminRoute />}>
          <Route path="/admin/studio/*" element={<NovelVerseStudio />} />
          <Route path="/admin" element={<CreatorPortal />} />
          <Route path="/admin/books" element={<CreatorPortal />} />
          <Route path="/admin/books/new" element={<CreatorPortal />} />
          <Route path="/admin/books/:id" element={<CreatorPortal />} />
          <Route path="/admin/books/:id/chapters" element={<CreatorPortal />} />
          <Route path="/admin/books/:id/audio" element={<CreatorPortal />} />
          <Route path="/admin/legacy" element={<Admin />} />
          <Route path="/admin/novels" element={<AdminNovels />} />
          <Route path="/admin/novels/add" element={<AddNovel />} />
          <Route path="/admin/novels/edit/:id" element={<EditNovel />} />
          <Route path="/admin/chapters" element={<AdminChapters />} />
          <Route path="/admin/chapters/add" element={<AddChapter />} />
          <Route path="/admin/chapters/edit/:id" element={<EditChapter />} />
          <Route path="/admin/taxonomy" element={<AdminTaxonomy />} />
          <Route path="/admin/characters" element={<AdminCharacters />} />
          <Route path="/admin/ai-brain" element={<AiBrainStudio />} />
          <Route path="/admin/voice-studio" element={<UniversalVoiceStudio />} />
          <Route path="/admin/voice-director" element={<Navigate replace to="/admin/voice-studio" />} />
          <Route path="/admin/scene-studio" element={<AdminSceneStudio />} />
          <Route path="/admin/audio-studio" element={<AiAudioStudio />} />
          <Route path="/admin/narration-studio" element={<NarrationStudio />} />
          <Route path="/admin/export-studio" element={<ExportStudio />} />
          <Route path="/admin/publishing" element={<PublishingStudio />} />
          <Route path="/admin/subscriptions" element={<SubscriptionAdmin />} />
          <Route path="/admin/languages" element={<LanguageDashboard />} />
          <Route path="/admin/novels/:novelId/characters" element={<AdminCharacters />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function ApplicationShell() {
  const location = useLocation();
  const isFocusedExperience = location.pathname.startsWith("/reader/") || location.pathname === "/login";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <a className="skip-link" href="#main-content">Перейти до основного вмісту</a>
      <span className="sr-only" aria-live="polite" key={location.pathname}>Сторінку відкрито</span>
      <div id="main-content" tabIndex="-1">
        <AppRoutes />
      </div>
      <NetworkBanner />
      {!isFocusedExperience && <BottomNav />}
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ApplicationShell />
    </BrowserRouter>
  );
}

export default App;
