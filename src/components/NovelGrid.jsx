import NovelCard from "./NovelCard";
import "./NovelGrid.css";

function NovelGrid({ novels, loading = false, error = "", emptyTitle = "Новел не знайдено", emptyText = "Спробуйте змінити пошук, категорію або сортування." }) {
  if (loading) {
    return (
      <div className="novel-grid novel-grid--loading" aria-label="Завантаження новел">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton novel-card-skeleton" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="error-state">Не вдалося завантажити новели. {error}</div>;
  }

  if (!novels.length) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="novel-grid">
      {novels.map((novel) => (
        <NovelCard
          key={novel.id}
          id={novel.id}
          title={novel.title}
          author={novel.author}
          rating={novel.rating}
          chapters={novel.chapters}
          description={novel.description}
          image={novel.image}
        />
      ))}
    </div>
  );
}

export default NovelGrid;
