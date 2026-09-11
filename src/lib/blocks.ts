import { parseFragment } from "./html";

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

export function htmlToBlocks(html: string): Block[] {
  const root = parseFragment(html);
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
    // WordPress wraps illustrations in a <p>; recurse so the image survives.
    if (tag === "P") {
      if (element.querySelector("img"))
        return Array.from(element.childNodes).forEach(walk);
      return pushWithLineBreaks(element, push);
    }
    if (tag === "IMG") return pushImage(element);

    if (element.children.length > 0) {
      Array.from(element.childNodes).forEach(walk);
    } else {
      push("paragraph", element.textContent ?? "");
    }
  };

  Array.from(root.childNodes).forEach(walk);
  return blocks;
}

function pushWithLineBreaks(
  element: Element,
  push: (type: BlockType, raw: string) => void,
): void {
  const withNewlines = element.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  const text = parseFragment(withNewlines).textContent ?? "";
  for (const line of text.split("\n")) push("paragraph", line);
}

function tidy(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
