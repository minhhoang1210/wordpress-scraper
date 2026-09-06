const XHTML_NS = "http://www.w3.org/1999/xhtml";
const serializer = new XMLSerializer();
const parser = new DOMParser();

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialises an HTML fragment as well-formed XHTML: EPUB readers use a strict XML
 * parser, and raw `&` or unclosed <br>/<img> tags are routine in WordPress output.
 */
export function toXhtmlFragment(html: string): string {
  const doc = parser.parseFromString(
    `<div id="__root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__root");
  if (!root) return "";

  return (
    Array.from(root.childNodes)
      .map((node) => serializer.serializeToString(node))
      // The wrapping document already declares the XHTML namespace, so the
      // per-element repetition is just noise.
      .join("")
      .replace(new RegExp(` xmlns="${XHTML_NS}"`, "g"), "")
  );
}

export function xhtmlDocument(
  title: string,
  bodyXhtml: string,
  language = "en",
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body>
${bodyXhtml}
  </body>
</html>
`;
}
