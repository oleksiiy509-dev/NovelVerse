const headingPattern = /^(?:(?:chapter|part|book)\s+[\divxlcdm]+|(?:глава|розділ|частина)\s+[\divxlcdm]+|#{1,3}\s+.+)$/i;
export const SUPPORTED_BOOK_EXTENSIONS = Object.freeze(["txt", "fb2", "epub", "docx", "pdf"]);
export const DEFAULT_CHAPTER_WORD_LIMIT = 15000;

export function decodeBookBytes(bytes) {
  const signatures = [
    { encoding: "utf-8", bytes: [0xef, 0xbb, 0xbf] },
    { encoding: "utf-16le", bytes: [0xff, 0xfe] },
    { encoding: "utf-16be", bytes: [0xfe, 0xff] },
  ];
  const signature = signatures.find((item) => item.bytes.every((byte, index) => bytes[index] === byte));
  if (signature) return { text: new TextDecoder(signature.encoding).decode(bytes), encoding: signature.encoding };

  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacements = (utf8.match(/�/g) || []).length;
  if (replacements <= Math.max(1, utf8.length * 0.001)) return { text: utf8, encoding: "utf-8" };
  return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
}

function textFromMarkup(markup) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  document.querySelectorAll("p, h1, h2, h3, title").forEach((node) => node.append("\n"));
  return (document.body?.textContent || document.documentElement.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitIntoChapters(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const chapters = [];
  let title = "Chapter 1";
  let body = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (content) chapters.push({ id: crypto.randomUUID(), title, content });
    body = [];
  };
  lines.forEach((line) => {
    const value = line.trim();
    if (value && value.length < 100 && headingPattern.test(value)) {
      flush();
      title = value.replace(/^#{1,3}\s*/, "");
    } else body.push(line);
  });
  flush();
  return chapters.length ? chapters : [{ id: crypto.randomUUID(), title: "Chapter 1", content: text.trim() }];
}

async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("The document ZIP directory is invalid.");
  let offset = view.getUint32(eocd + 16, true);
  const entries = view.getUint16(eocd + 10, true);
  for (let entry = 0; entry < entries; entry += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The document ZIP entry is invalid.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    let data = bytes.slice(start, start + compressedSize);
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (method !== 0) throw new Error(`Unsupported ZIP compression method: ${method}`);
    files.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export function getBookStatistics(chapters = []) {
  const words = chapters.reduce((total, chapter) => total + (chapter.content.trim().match(/\S+/g)?.length || 0), 0);
  return { chapters: chapters.length, words, readingMinutes: Math.ceil(words / 225) };
}

export function validateBookChapters(chapters = [], wordLimit = DEFAULT_CHAPTER_WORD_LIMIT) {
  const warnings = [];
  const titles = new Map();
  chapters.forEach((chapter, index) => {
    const title = chapter.title.trim().toLocaleLowerCase();
    if (!chapter.content.trim()) warnings.push(`Chapter ${index + 1} is empty.`);
    if (title) titles.set(title, [...(titles.get(title) || []), index + 1]);
    const words = chapter.content.trim().match(/\S+/g)?.length || 0;
    if (words > wordLimit) warnings.push(`“${chapter.title || `Chapter ${index + 1}`}” exceeds the ${wordLimit.toLocaleString()} word limit.`);
  });
  titles.forEach((positions, title) => {
    if (positions.length > 1) warnings.push(`Duplicate chapter title “${title}” (chapters ${positions.join(", ")}).`);
  });
  return warnings;
}

function xmlValue(document, selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function parseFb2(text) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const titleInfo = document.querySelector("title-info");
  const author = titleInfo?.querySelector("author");
  const chapters = [...document.querySelectorAll("body > section")].map((section, index) => ({
    id: crypto.randomUUID(),
    title: xmlValue(section, ["title"]) || `Chapter ${index + 1}`,
    content: [...section.querySelectorAll("p")].map((node) => node.textContent.trim()).filter(Boolean).join("\n\n"),
  })).filter((chapter) => chapter.content);
  return {
    metadata: {
      title: xmlValue(titleInfo, ["book-title"]),
      author: [xmlValue(author, ["first-name"]), xmlValue(author, ["last-name"])].filter(Boolean).join(" "),
      language: xmlValue(titleInfo, ["lang"]),
      description: xmlValue(titleInfo, ["annotation"]),
    }, chapters,
  };
}

async function parseEpub(bytes) {
  const files = await unzip(bytes);
  const decode = (path) => decodeBookBytes(files.get(path) || new Uint8Array()).text;
  const container = new DOMParser().parseFromString(decode("META-INF/container.xml"), "application/xml");
  const packagePath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!packagePath) throw new Error("EPUB package was not found.");
  const packageDocument = new DOMParser().parseFromString(decode(packagePath), "application/xml");
  const base = packagePath.includes("/") ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1) : "";
  const manifest = new Map([...packageDocument.querySelectorAll("manifest item")].map((node) => [node.id, node.getAttribute("href")]));
  const spine = [...packageDocument.querySelectorAll("spine itemref")].map((node) => manifest.get(node.getAttribute("idref"))).filter(Boolean);
  const chapters = spine.map((href, index) => {
    const document = new DOMParser().parseFromString(decode(base + href), "text/html");
    return { id: crypto.randomUUID(), title: xmlValue(document, ["h1", "h2", "title"]) || `Chapter ${index + 1}`, content: textFromMarkup(decode(base + href)) };
  }).filter((chapter) => chapter.content);
  const coverItem = [...packageDocument.querySelectorAll("manifest item")].find((node) => /cover/i.test(node.id) && /^image\//.test(node.getAttribute("media-type") || ""));
  const coverBytes = coverItem ? files.get(base + coverItem.getAttribute("href")) : null;
  return { metadata: {
    title: xmlValue(packageDocument, ["title", "dc\\:title"]), author: xmlValue(packageDocument, ["creator", "dc\\:creator"]),
    language: xmlValue(packageDocument, ["language", "dc\\:language"]), description: xmlValue(packageDocument, ["description", "dc\\:description"]),
    cover: coverBytes ? URL.createObjectURL(new Blob([coverBytes], { type: coverItem.getAttribute("media-type") })) : "",
  }, chapters };
}

async function parseDocx(bytes) {
  const files = await unzip(bytes);
  const text = decodeBookBytes(files.get("word/document.xml") || new Uint8Array()).text
    .replace(/<w:tab\s*\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n").replace(/<\/w:p>/g, "\n");
  const core = new DOMParser().parseFromString(decodeBookBytes(files.get("docProps/core.xml") || new Uint8Array()).text, "application/xml");
  const content = textFromMarkup(text);
  return { metadata: { title: xmlValue(core, ["title"]), author: xmlValue(core, ["creator"]), language: xmlValue(core, ["language"]), description: xmlValue(core, ["description"]) }, chapters: splitIntoChapters(content) };
}

function parsePdf(bytes) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const strings = [...raw.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)].map((match) => match[1].replace(/\\([()\\])/g, "$1"));
  if (!strings.length) throw new Error("This PDF has no locally extractable text. Try a text-based PDF.");
  return { metadata: {}, chapters: splitIntoChapters(strings.join("\n")), warnings: ["PDF layout and scanned pages may not be preserved."] };
}

export async function parseBook(file, onProgress = () => {}) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!SUPPORTED_BOOK_EXTENSIONS.includes(extension)) throw new Error("Unsupported file format. Choose TXT, FB2, EPUB, DOCX or PDF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress(25);
  const decoded = decodeBookBytes(bytes);
  let result;
  if (extension === "fb2") result = parseFb2(decoded.text);
  else if (extension === "epub") result = await parseEpub(bytes);
  else if (extension === "docx") result = await parseDocx(bytes);
  else if (extension === "pdf") result = parsePdf(bytes);
  else result = { metadata: {}, chapters: splitIntoChapters(decoded.text) };
  onProgress(85);
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
  const metadata = { title: fallbackTitle, author: "Unknown author", language: "Unknown", description: "", cover: "", ...result.metadata };
  const warnings = [...(result.warnings || [])];
  if (!result.metadata.title) warnings.push("Title was inferred from the file name.");
  if (!result.metadata.author) warnings.push("Author metadata was not found.");
  if (["txt", "fb2"].includes(extension) && decoded.encoding !== "utf-8") warnings.push(`Unsupported encoding detected (${decoded.encoding}); converted locally and some characters may be incorrect.`);
  if (!result.chapters.length) throw new Error("No readable chapters were found.");
  onProgress(100);
  return { metadata, chapters: result.chapters, warnings, encoding: extension === "txt" || extension === "fb2" ? decoded.encoding : "Embedded format" };
}
