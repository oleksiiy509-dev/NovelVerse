const PLACEHOLDER_CARDS = Array.from({ length: 6 }, (_, index) => (
  <div className="skeleton page-loading__card" key={index} />
));

function PageLoadingSkeleton() {
  return (
    <main className="page-shell page-loading" aria-busy="true" aria-label="Завантаження сторінки">
      <span className="sr-only">Завантажуємо NovelVerse…</span>
      <div className="skeleton page-loading__title" />
      <div className="skeleton page-loading__toolbar" />
      <div className="page-loading__grid">
        {PLACEHOLDER_CARDS}
      </div>
    </main>
  );
}

export default PageLoadingSkeleton;
