import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import BottomNav from "./components/BottomNav.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import NetworkBanner from "./components/NetworkBanner.jsx";
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
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

function AppRoutes() {
  useTelegramBackButton();

  return (
    <Suspense fallback={<div className="page-shell loading-state">Завантажуємо NovelVerse...</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/novel/:id" element={<Novel />} />
        <Route path="/login" element={<Login />} />
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppRoutes />
        <NetworkBanner />
        <BottomNav />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
