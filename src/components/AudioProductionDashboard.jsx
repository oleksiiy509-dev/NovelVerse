import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadManagedBooks } from "../lib/bookManagement";
import { EMPTY_DIRECTOR, firstChapterWithSegments, loadVoiceDirector, subscribeToVoiceDirector } from "../lib/voiceDirectorStorage";
import ChapterGeneration from "./ChapterGeneration";

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
      const selectedDirector = loadVoiceDirector(selectedBook?.id);
      setBooks(items);
      setBookId(String(selectedBook?.id || ""));
      setDirector(selectedDirector);
      setChapterId(String(firstChapterWithSegments(selectedBook?.chapters, selectedDirector.segments)?.id || selectedBook?.chapters[0]?.id || ""));
    }).catch((loadError) => setError(loadError.message));
  }, [searchParams]);

  useEffect(() => {
    if (!bookId) return undefined;
    const applyDirector = (nextDirector) => {
      setDirector(nextDirector);
      setChapterId((currentId) => {
        const currentHasSegments = nextDirector.segments.some((segment) => String(segment.chapterId) === String(currentId));
        return currentHasSegments ? currentId : String(firstChapterWithSegments(book?.chapters, nextDirector.segments)?.id || currentId || "");
      });
    };
    return subscribeToVoiceDirector(bookId, applyDirector);
  }, [bookId, book]);

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
          const nextDirector = loadVoiceDirector(nextBook?.id);
          setBookId(event.target.value);
          setDirector(nextDirector);
          setChapterId(String(firstChapterWithSegments(nextBook?.chapters, nextDirector.segments)?.id || nextBook?.chapters[0]?.id || ""));
        }}>{books.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{(book?.chapters || []).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      </div>

      <ChapterGeneration book={book} chapter={chapter} segments={director.segments}/>
    </div>
  );
}

export default AudioProductionDashboard;
