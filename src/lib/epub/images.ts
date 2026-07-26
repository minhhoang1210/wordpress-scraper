import type { ExportHooks, ImageFetcher } from "../types";
import { toXhtmlFragment } from "../xhtml";
import { errorMessage } from "../text";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface EmbeddedImage {
  id: string;
  path: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * Downloads each remote image once and rewrites its `src` to a book-relative path,
 * so the EPUB reads correctly offline. `images` accumulates across calls: the same
 * illustration used in several chapters is stored a single time.
 */
export async function embedImages(
  bodyXhtml: string,
  images: EmbeddedImage[],
  fetchImage: ImageFetcher,
  hooks: ExportHooks,
): Promise<string> {
  const doc = new DOMParser().parseFromString(
    `<div id="__root">${bodyXhtml}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__root")!;
  const targets = Array.from(root.querySelectorAll("img[src]"));
  if (targets.length === 0) return bodyXhtml;

  const byId = new Map(images.map((image) => [image.id, image.path]));

  for (const img of targets) {
    const src = img.getAttribute("src")!;
    if (!/^https?:/i.test(src)) continue;

    const id = `img-${await hashUrl(src)}`;
    const existing = byId.get(id);
    if (existing) {
      img.setAttribute("src", existing);
      continue;
    }

    try {
      const { data, mimeType } = await fetchImage(src);
      const path = `images/${id}.${MIME_EXTENSIONS[mimeType] ?? "jpg"}`;
      images.push({ id, path, mimeType, data });
      byId.set(id, path);
      img.setAttribute("src", path);
    } catch (error) {
      hooks.onWarning?.(`Bỏ qua ảnh ${src}: ${errorMessage(error)}`);
      img.remove();
    }
  }

  return toXhtmlFragment(root.innerHTML);
}

/** Short content-addressed id, so the same URL always maps to the same file. */
async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
