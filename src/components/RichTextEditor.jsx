import { useEffect, useRef } from "react";

import { sanitizeRichText } from "../lib/richText";

const tools = [
  ["formatBlock", "Heading", "h2"],
  ["bold", "Bold"],
  ["italic", "Italic"],
  ["insertUnorderedList", "List"],
  ["formatBlock", "Quote", "blockquote"],
];

function RichTextEditor({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitizeRichText(value || "");
  }, [value]);
  function run(command, argument) {
    document.execCommand(command, false, argument);
    onChange(sanitizeRichText(ref.current?.innerHTML || ""));
    ref.current?.focus();
  }
  return <div>
    <div className="admin-editor-toolbar">
      {tools.map(([command, label, argument]) => <button className="admin-secondary" type="button" key={label} onClick={() => run(command, argument)}>{label}</button>)}
      <button className="admin-secondary" type="button" onClick={() => run("formatBlock", "p")}>Paragraph</button>
    </div>
    <div ref={ref} className="admin-rich-editor" contentEditable onBlur={(e) => onChange(sanitizeRichText(e.currentTarget.innerHTML))} onInput={(e) => onChange(e.currentTarget.innerHTML)} aria-label="Chapter content" />
  </div>;
}

export default RichTextEditor;
