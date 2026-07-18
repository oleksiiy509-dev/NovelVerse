import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Library from "./pages/Library.jsx";
import Profile from "./pages/Profile.jsx";
import Reader from "./pages/Reader.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import AdminNovels from "./pages/AdminNovels.jsx";
import AddNovel from "./pages/AddNovel.jsx";
import AdminChapters from "./pages/AdminChapters.jsx";
import AddChapter from "./pages/AddChapter.jsx";

import BottomNav from "./components/BottomNav.jsx";
import EditChapter from "./pages/EditChapter";
import Novel from "./pages/Novel";

function App() {
  return (
    <BrowserRouter>
      <Routes>
  <Route path="/" element={<Home />} />
  <Route path="/library" element={<Library />} />
  <Route path="/profile" element={<Profile />} />
  <Route path="/reader/:id" element={<Reader />} />
  <Route path="/login" element={<Login />} />
  <Route path="/admin" element={<Admin />} />
  <Route path="/admin/novels" element={<AdminNovels />} />
  <Route path="/admin/novels/add" element={<AddNovel />} />
  <Route path="/admin/chapters" element={<AdminChapters />} />
<Route path="/admin/chapters/add" element={<AddChapter />} />
<Route path="/admin/chapters/edit/:id" element={<EditChapter />} />
<Route path="/novel/:id" element={<Novel />} />
</Routes>

      <BottomNav />
    </BrowserRouter>
  );
}

export default App;