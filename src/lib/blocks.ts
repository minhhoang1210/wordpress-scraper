import { parseHtml } from "./parser";

export type BlockType =
  "heading" | "subheading" | "paragraph" | "quote" | "list" | "rule" | "image";

export interface Block {
  type: BlockType;
  text: string;
  /** Absolute image URL; set only on `image` blocks. */
  src?: string;
}

const HEADING_TAGS = new Set(["H1", "H2"]);
const SUBHEADING_TAGS = new Set(["H3", "H4", "H5", "H6"]);

/**
 * Flattens cleaned chapter HTML into a linear list of text blocks. The PDF writer
 * draws text directly rather than rendering a DOM, so structure has to be reduced
 * to something it can lay out line by line.
 */
export function htmlToBlocks(html: string): Block[] {
  const doc = parseHtml(`<div id="__root">${html}</div>`);
  const root = doc.getElementById("__root");
  if (!root) return [];

  const blocks: Block[] = [];

  const push = (type: BlockType, raw: string) => {
    const text = tidy(raw);
    if (type === "rule") {
      blocks.push({ type, text: "" });
    } else if (text) {
      blocks.push({ type, text });
    }
  };

  const pushImage = (element: Element) => {
    const src = element.getAttribute("src");
    // Only absolute http(s) sources are fetchable; parser.ts already resolved them.
    if (src && /^https?:/i.test(src)) {
      blocks.push({
        type: "image",
        text: element.getAttribute("alt") ?? "",
        src,
      });
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Loose text between block elements still belongs in the output.
      push("paragraph", node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const tag = element.tagName;

    if (tag === "HR") return push("rule", "");
    if (HEADING_TAGS.has(tag))
      return push("heading", element.textContent ?? "");
    if (SUBHEADING_TAGS.has(tag))
      return push("subheading", element.textContent ?? "");
    if (tag === "BLOCKQUOTE") return push("quote", element.textContent ?? "");
    if (tag === "LI") return push("list", element.textContent ?? "");
    // WordPress usually wraps illustrations in a <p>; recurse so the image survives
    // instead of being flattened to its (empty) text content.
    if (tag === "P") {
      if (element.querySelector("img"))
        return Array.from(element.childNodes).forEach(walk);
      return pushWithLineBreaks(element, push);
    }
    if (tag === "IMG") return pushImage(element);
    // FIGURE falls through to the container branch so its <img> and <figcaption>
    // are both picked up.

    // Containers (div, section, ul, ol, table…) recurse; leaf inline content is
    // gathered as a paragraph so nothing is silently dropped.
    if (element.children.length > 0) {
      Array.from(element.childNodes).forEach(walk);
    } else {
      push("paragraph", element.textContent ?? "");
    }
  };

  Array.from(root.childNodes).forEach(walk);
  return blocks;
}

/** A <p> holding <br>-separated lines becomes one paragraph per line. */
function pushWithLineBreaks(
  element: Element,
  push: (type: BlockType, raw: string) => void,
): void {
  const html = element.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  const text = parseHtml(`<div>${html}</div>`).body.textContent ?? "";
  for (const line of text.split("\n")) push("paragraph", line);
}

function tidy(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
