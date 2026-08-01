import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadManagedBooks } from "../lib/bookManagement";
import { directorStorageKey, parseDirectorJson } from "../lib/voiceDirectorLocal";
import ChapterGeneration from "./ChapterGeneration";

const EMPTY_DIRECTOR = { characters: [], segments: [] };

function readDirector(bookId) {
  try {
    const saved = localStorage.getItem(directorStorageKey(bookId));
    return saved ? parseDirectorJson(saved) : EMPTY_DIRECTOR;
  } catch {
    return EMPTY_DIRECTOR;
  }
}

function AudioProductionDashboard() {
  const [searchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [director, setDirector] = useState(EMPTY_DIRECTOR);
  const [error, setError] = useState("");
  const book = books.find((item) => String(item.id) === bookId);
  const chapter = book?.chapters.find((item) => String(item.id) === chapterId);

  useEffect(() => {
    loadManagedBooks().then((items) => {
      const requestedBook = searchParams.get("book");
      const selectedBook = items.find((item) => String(item.id) === requestedBook) || items[0];
      setBooks(items);
      setBookId(String(selectedBook?.id || ""));
      setChapterId(String(selectedBook?.chapters[0]?.id || ""));
    }).catch((loadError) => setError(loadError.message));
  }, [searchParams]);

  useEffect(() => {
    setDirector(bookId ? readDirector(bookId) : EMPTY_DIRECTOR);
  }, [bookId]);

  return (
    <div className="audio-production">
      <header className="audio-production__header">
        <div>
          <h2>Audio Production</h2>
          <p>Generate and track local chapter audio for your book.</p>
        </div>
      </header>

      {error && <p className="chapter-generation__error" role="alert">{error}</p>}

      <div className="voice-director__selectors">
        <label>Book<select value={bookId} onChange={(event) => {
          const nextBook = books.find((item) => String(item.id) === event.target.value);
          setBookId(event.target.value);
          setChapterId(String(nextBook?.chapters[0]?.id || ""));
        }}>{books.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{(book?.chapters || []).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      </div>

      <ChapterGeneration book={book} chapter={chapter} segments={director.segments}/>
    </div>
  );
}

export default AudioProductionDashboard;
