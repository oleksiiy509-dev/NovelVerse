import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Library from "./pages/Library.jsx";
import Catalog from "./pages/Catalog.jsx";
import Profile from "./pages/Profile.jsx";
import Downloads from "./pages/Downloads.jsx";
import Reader from "./pages/Reader.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import AdminNovels from "./pages/AdminNovels.jsx";
import AddNovel from "./pages/AddNovel.jsx";
import AdminChapters from "./pages/AdminChapters.jsx";
import AddChapter from "./pages/AddChapter.jsx";
import EditNovel from "./pages/EditNovel.jsx";
import AdminTaxonomy from "./pages/AdminTaxonomy.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";

import BottomNav from "./components/BottomNav.jsx";
import NetworkBanner from "./components/NetworkBanner.jsx";
import EditChapter from "./pages/EditChapter";
import Novel from "./pages/Novel";
import { useTelegramBackButton } from "./hooks/useTelegram";

function AppRoutes() {
  useTelegramBackButton();
  return (
      <Routes>
  <Route path="/" element={<Home />} />
  <Route path="/library" element={<Library />} />
  <Route path="/catalog" element={<Catalog />} />
  <Route path="/profile" element={<Profile />} />
  <Route path="/downloads" element={<Downloads />} />
  <Route path="/reader/:id" element={<Reader />} />
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
<Route path="/novel/:id" element={<Novel />} />
</Routes>
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