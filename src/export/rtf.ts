/**
 * Rendering an {@link ExportPayload}'s HTML as **RTF** for the SpeechDrop target.
 *
 * ## Why RTF (formatting preserved, appropriate to the target)
 *
 * SpeechDrop is a *document*-sharing tool: its upload endpoint accepts only real
 * document types (DOC/DOCX/ODT/PDF/RTF/TXT), and explicitly **not** `text/html`.
 * A debater's speech doc or block file leans on formatting (bold taglines,
 * highlighted read-aloud text, headings), so uploading flattened plain text
 * would lose exactly what matters. RTF is the sweet spot: it is in SpeechDrop's
 * allowlist, is plain-text-derivable (no binary document library), and preserves
 * bold, underline, headings, and highlight - so the export stays *formatted
 * appropriate to the target*.
 *
 * The payload already carries the document as semantic HTML (the exact
 * `<strong>`/`<mark>`/`<h1>` the editor's `DOMSerializer` renders - see
 * {@link ./payload}). This module converts that known, small HTML subset to RTF;
 * it does **not** rework payload assembly or the target boundary - the SpeechDrop
 * target simply derives the representation its transport supports from the
 * provided HTML, exactly as the boundary intends ("a target picks the
 * representation its transport supports").
 *
 * The converter is deliberately scoped to the tags the editor emits and degrades
 * gracefully: an unknown element still contributes its text (unformatted), so no
 * content is ever dropped.
 */

/** Escapes a run of text for an RTF body: RTF metacharacters + non-ASCII. */
function escapeRtfText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") {
      out += "\\" + ch;
    } else if (ch === "\n") {
      out += "\\line ";
    } else if (code < 128) {
      out += ch;
    } else if (code <= 0xffff) {
      // RTF \uN uses a signed 16-bit code unit; the trailing "?" is the ASCII
      // fallback for readers that cannot render the Unicode escape.
      const signed = code > 32767 ? code - 65536 : code;
      out += `\\u${signed}?`;
    } else {
      // Astral plane: emit as a surrogate pair of \u escapes.
      const c = code - 0x10000;
      const hi = 0xd800 + (c >> 10);
      const lo = 0xdc00 + (c & 0x3ff);
      out += `\\u${hi}?\\u${lo - (lo > 32767 ? 65536 : 0)}?`;
    }
  }
  return out;
}

/** Half-point RTF font size (`\fsN`) for a heading level; body is 24 (12pt). */
function headingFontSize(level: number): number {
  switch (level) {
    case 1:
      return 36;
    case 2:
      return 32;
    case 3:
      return 28;
    default:
      return 26;
  }
}

/** Inline formatting state threaded through the recursive walk. */
interface InlineFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
}

const BASE_FORMAT: InlineFormat = {
  bold: false,
  italic: false,
  underline: false,
  highlight: false,
};

/** Serializes a text node with the active inline format wrapped around it. */
function serializeText(text: string, fmt: InlineFormat): string {
  if (text.length === 0) return "";
  const open: string[] = [];
  const close: string[] = [];
  if (fmt.bold) {
    open.push("\\b ");
    close.unshift("\\b0 ");
  }
  if (fmt.italic) {
    open.push("\\i ");
    close.unshift("\\i0 ");
  }
  if (fmt.underline) {
    open.push("\\ul ");
    close.unshift("\\ulnone ");
  }
  if (fmt.highlight) {
    open.push("\\highlight1 ");
    close.unshift("\\highlight0 ");
  }
  return open.join("") + escapeRtfText(text) + close.join("");
}

/** Extends the inline format for an inline element (`<strong>`, `<mark>`, …). */
function formatForElement(tag: string, fmt: InlineFormat): InlineFormat {
  switch (tag) {
    case "strong":
    case "b":
      return { ...fmt, bold: true };
    case "em":
    case "i":
      return { ...fmt, italic: true };
    case "u":
      return { ...fmt, underline: true };
    case "mark":
      return { ...fmt, highlight: true };
    default:
      return fmt;
  }
}

/** Recursively serializes the inline content of a block element. */
function serializeInline(node: Node, fmt: InlineFormat): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      out += serializeText(child.textContent ?? "", fmt);
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        out += "\\line ";
      } else {
        out += serializeInline(child, formatForElement(tag, fmt));
      }
    }
  });
  return out;
}

/** The block-level tags the editor emits, each rendered as its own paragraph. */
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Serializes one block element to an RTF paragraph. */
function serializeBlock(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const inline = serializeInline(el, BASE_FORMAT);
  if (inline.trim() === "") return "";
  if (HEADING_TAGS.has(tag)) {
    const level = Number(tag.slice(1));
    return `\\pard\\sb120\\fs${headingFontSize(level)}\\b ${inline}\\b0\\par\n`;
  }
  return `\\pard\\fs24 ${inline}\\par\n`;
}

/**
 * Converts an export payload's HTML document to an RTF document string.
 *
 * Walks the parsed body's top-level blocks (paragraphs and headings), preserving
 * bold, italic, underline, highlight, and heading emphasis. Unknown elements
 * still contribute their text, so content is never dropped. Requires a DOM
 * (`DOMParser`), which both the Tauri webview and the jsdom test environment
 * provide.
 */
export function htmlToRtf(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  const blocks: string[] = [];
  // Group any loose top-level inline/text runs (outside a block element) into a
  // paragraph so nothing is lost.
  let looseInline = "";
  const flushLoose = () => {
    const trimmed = looseInline.trim();
    if (trimmed !== "") blocks.push(`\\pard\\fs24 ${looseInline}\\par\n`);
    looseInline = "";
  };

  body.childNodes.forEach((node) => {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      looseInline += serializeText(node.textContent ?? "", BASE_FORMAT);
      return;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "p" || HEADING_TAGS.has(tag)) {
      flushLoose();
      const block = serializeBlock(el);
      if (block !== "") blocks.push(block);
    } else if (tag === "br") {
      looseInline += "\\line ";
    } else {
      // A stray inline wrapper (e.g. <strong> at top level): serialize inline.
      looseInline += serializeInline(el, BASE_FORMAT);
    }
  });
  flushLoose();

  const header =
    "{\\rtf1\\ansi\\ansicpg1252\\deff0" +
    "{\\fonttbl{\\f0\\fnil Calibri;}}" +
    // Color table: index 0 = auto (empty), index 1 = yellow (highlight).
    "{\\colortbl;\\red255\\green255\\blue0;}" +
    "\\f0 ";
  return header + blocks.join("") + "}";
}
