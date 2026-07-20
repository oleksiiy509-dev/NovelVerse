import { useEffect, useRef } from "react";

const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H2", "H3", "BLOCKQUOTE"]);
const tools = [
  ["formatBlock", "Heading", "h2"],
  ["bold", "Bold"],
  ["italic", "Italic"],
  ["insertUnorderedList", "List"],
  ["formatBlock", "Quote", "blockquote"],
];

export function sanitizeRichText(value = "") {
  const doc = new DOMParser().parseFromString(String(value), "text/html");
  doc.body.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    if (!allowedTags.has(node.tagName)) node.replaceWith(...node.childNodes);
  });
  return doc.body.innerHTML.trim();
}

export function htmlToPlainText(value = "") {
  const doc = new DOMParser().parseFromString(sanitizeRichText(value), "text/html");
  return doc.body.textContent?.replace(/\s+/g, " ").trim() || "";
}

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
