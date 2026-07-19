import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Profile from "./pages/Profile.jsx";
import Login from "./pages/Login.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import BottomNav from "./components/BottomNav.jsx";
import NetworkBanner from "./components/NetworkBanner.jsx";
import { useTelegramBackButton } from "./hooks/useTelegram";

const Library = lazy(() => import("./pages/Library.jsx"));
const Catalog = lazy(() => import("./pages/Catalog.jsx"));
const Downloads = lazy(() => import("./pages/Downloads.jsx"));
const Reader = lazy(() => import("./pages/Reader.jsx"));
const Novel = lazy(() => import("./pages/Novel.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const AdminNovels = lazy(() => import("./pages/AdminNovels.jsx"));
const AddNovel = lazy(() => import("./pages/AddNovel.jsx"));
const EditNovel = lazy(() => import("./pages/EditNovel.jsx"));
const AdminChapters = lazy(() => import("./pages/AdminChapters.jsx"));
const AddChapter = lazy(() => import("./pages/AddChapter.jsx"));
const EditChapter = lazy(() => import("./pages/EditChapter.jsx"));
const AdminTaxonomy = lazy(() => import("./pages/AdminTaxonomy.jsx"));

function PageFallback() {
  return <main className="page-shell"><div className="loading-state">Завантаження…</div></main>;
}

function AppRoutes() {
  useTelegramBackButton();
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/login" element={<Login />} />
        <Route path="/novel/:id" element={<Novel />} />
        <Route element={<ProtectedAdminRoute />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/novels" element={<AdminNovels />} />
          <Route path="/admin/novels/add" element={<AddNovel />} />
          <Route path="/admin/novels/edit/:id" element={<EditNovel />} />
          <Route path="/admin/chapters" element={<AdminChapters />} />
          <Route path="/admin/chapters/add" element={<AddChapter />} />
          <Route path="/admin/chapters/edit/:id" element={<EditChapter />} />
          <Route path="/admin/taxonomy" element={<AdminTaxonomy />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <NetworkBanner />
      <BottomNav />
    </BrowserRouter>
  );
}

export default App;
