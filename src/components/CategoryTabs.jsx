import "./CategoryTabs.css";

const defaultTabs = ["Усі", "Популярні", "Новинки", "Завершені"];

function CategoryTabs({ active, onChange, categories = defaultTabs }) {
  return (
    <div className="tabs" aria-label="Категорії та жанри">
      {categories.map((tab) => (
        <button
          key={tab}
          className={active === tab ? "tab active" : "tab"}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export default CategoryTabs;
