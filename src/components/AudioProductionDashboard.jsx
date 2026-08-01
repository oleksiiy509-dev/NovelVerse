import { useState } from "react";

const books = [
  {
    id: "last-horizon",
    title: "The Last Horizon",
    chapters: [
      { id: 1, title: "Chapter 1 · The Signal", director: "Ready", segments: "12 / 12" },
      { id: 2, title: "Chapter 2 · Departure", director: "In review", segments: "8 / 14" },
      { id: 3, title: "Chapter 3 · Dark Orbit", director: "Not started", segments: "0 / 11" },
    ],
  },
  {
    id: "echoes-aether",
    title: "Echoes of Aether",
    chapters: [
      { id: 1, title: "Chapter 1 · The Crossing", director: "Ready", segments: "9 / 9" },
      { id: 2, title: "Chapter 2 · An Old Voice", director: "Not started", segments: "0 / 13" },
    ],
  },
];

function AudioProductionDashboard() {
  const [bookId, setBookId] = useState(books[0].id);
  const [chapterId, setChapterId] = useState(books[0].chapters[0].id);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const book = books.find((item) => item.id === bookId) || books[0];
  const chapter = book.chapters.find((item) => item.id === chapterId) || book.chapters[0];

  const placeholderAction = (message) => setNotice(`${message} is a placeholder action.`);

  return (
    <div className="audio-production">
      <header className="audio-production__header">
        <div>
          <h2>Audio Production</h2>
          <p>Prepare and track chapter audio for your book.</p>
        </div>
        <button type="button" onClick={() => placeholderAction("Generate entire book")}>Generate Entire Book</button>
      </header>

      {notice && <p className="audio-production__notice" role="status">{notice}</p>}

      <label className="audio-production__selector">
        <span>Book</span>
        <select value={bookId} onChange={(event) => { const nextBook = books.find((item) => item.id === event.target.value); setBookId(event.target.value); setChapterId(nextBook.chapters[0].id); }}>
          {books.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>

      <div className="audio-production__layout">
        <aside className="audio-production__chapters" aria-label="Chapters">
          <h3>Chapters</h3>
          {book.chapters.map((item) => (
            <button type="button" className={item.id === chapter.id ? "active" : ""} key={item.id} onClick={() => setChapterId(item.id)}>
              <span>{item.title}</span>
              <small>{item.director}</small>
            </button>
          ))}
        </aside>

        <section className="audio-production__workspace">
          <div className="audio-production__title-row">
            <div><small>SELECTED CHAPTER</small><h3>{chapter.title}</h3></div>
            <button type="button" onClick={() => placeholderAction("Generate chapter")}>Generate Chapter</button>
          </div>
          <div className="audio-production__statuses">
            <article><span>Director status</span><strong>{chapter.director}</strong></article>
            <article><span>Voice Segments status</span><strong>{chapter.segments}</strong></article>
          </div>
          <div className="audio-production__controls">
            <button type="button" className="secondary" onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
          </div>
          <div className="audio-production__preview">
            <span aria-hidden="true">▶</span>
            <div><h4>Audio preview</h4><p>Generated chapter audio will appear here.</p></div>
          </div>
          <div className="audio-production__actions">
            <button type="button" className="secondary" onClick={() => placeholderAction("Upload MP3")}>Upload MP3</button>
            <button type="button" className="secondary" onClick={() => placeholderAction("Publish")}>Publish</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AudioProductionDashboard;
