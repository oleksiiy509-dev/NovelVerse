import { useEffect, useRef } from "react";

const tools = [
  ["bold", "Жирний"],
  ["italic", "Курсив"],
  ["underline", "Підкреслити"],
  ["insertUnorderedList", "Список"],
  ["formatBlock", "Цитата", "blockquote"],
];

function RichTextEditor({ value, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
  }, [value]);

  function run(command, argument) {
    document.execCommand(command, false, argument);
    onChange(ref.current?.innerHTML || "");
    ref.current?.focus();
  }

  return <div>
    <div className="admin-editor-toolbar">
      {tools.map(([command, label, argument]) => <button className="admin-secondary" type="button" key={label} onClick={() => run(command, argument)}>{label}</button>)}
      <button className="admin-secondary" type="button" onClick={() => run("formatBlock", "p")}>Абзац</button>
    </div>
    <div ref={ref} className="admin-rich-editor" contentEditable onInput={(e) => onChange(e.currentTarget.innerHTML)} aria-label="Вміст глави" />
  </div>;
}

export default RichTextEditor;
