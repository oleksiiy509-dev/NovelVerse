import "./CategoryTabs.css";

const tabs = [
  "Усі",
  "Популярні",
  "Новинки",
  "Завершені",
];

function CategoryTabs({ active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
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