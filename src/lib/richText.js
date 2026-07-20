const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H2", "H3", "BLOCKQUOTE"]);

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
