import NovelCard from "./NovelCard";
import "./NovelGrid.css";

function NovelGrid({ novels }) {
  if (!novels.length) {
    return (
      <p style={{ color: "white", textAlign: "center" }}>
        Новел не знайдено.
      </p>
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