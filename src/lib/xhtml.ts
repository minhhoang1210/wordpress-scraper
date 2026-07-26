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
 * Converts an HTML fragment into well-formed XHTML. EPUB readers parse content
 * documents with a strict XML parser, so unclosed <br>/<img> tags or raw `&`
 * characters — both routine in WordPress output — would break the book.
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
      // XMLSerializer stamps every serialized element with the XHTML namespace; the
      // wrapping document already declares it, so the repetition is just noise.
      .join("")
      .replace(new RegExp(` xmlns="${XHTML_NS}"`, "g"), "")
  );
}

/** Wraps a fragment in a complete XHTML content document. */
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
