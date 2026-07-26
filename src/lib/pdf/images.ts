import type { Block } from "../blocks";
import type { ExportHooks, ImageFetcher } from "../types";
import { runPool } from "../async";
import { errorMessage } from "../text";

/** Longest edge, in pixels, that an embedded image is downscaled to. */
const MAX_IMAGE_EDGE = 1400;
/** Re-encode quality; low enough to keep an illustrated book a sane size. */
const JPEG_QUALITY = 0.82;
const CONCURRENCY = 4;

export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Every image the PDF can draw, keyed by its original URL. */
export type ImageStore = Map<string, LoadedImage>;

/**
 * Downloads each distinct image referenced by the sections and decodes it to a JPEG
 * data URL. This has to happen before layout because the drawing pass is synchronous
 * and needs pixel dimensions to reserve the right space.
 *
 * Failures are reported and skipped — a missing illustration must never abort the
 * whole export.
 */
export async function preloadImages(
  sections: { blocks: Block[] }[],
  fetchImage: ImageFetcher | undefined,
  hooks: ExportHooks,
): Promise<ImageStore> {
  const store: ImageStore = new Map();
  if (!fetchImage) return store;

  const urls = [
    ...new Set(
      sections.flatMap((section) =>
        section.blocks
          .filter((block) => block.type === "image" && block.src)
          .map((block) => block.src!),
      ),
    ),
  ];
  if (urls.length === 0) return store;

  let done = 0;

  await runPool(
    urls,
    async (url) => {
      try {
        const image = await decodeImage(url, fetchImage);
        if (image) store.set(url, image);
        else hooks.onWarning?.(`Bỏ qua ảnh (không giải mã được): ${url}`);
      } catch (error) {
        hooks.onWarning?.(`Bỏ qua ảnh ${url}: ${errorMessage(error)}`);
      }
      hooks.onStatus?.(`Đang tải ảnh ${++done}/${urls.length}…`);
    },
    { concurrency: CONCURRENCY },
  );

  return store;
}

/** Rasterises arbitrary image bytes (PNG/WebP/GIF/JPEG) to a JPEG jsPDF can embed. */
async function decodeImage(
  url: string,
  fetchImage: ImageFetcher,
): Promise<LoadedImage | null> {
  const { data, mimeType } = await fetchImage(url);
  const objectUrl = URL.createObjectURL(
    new Blob([data as BlobPart], { type: mimeType }),
  );

  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("trình duyệt không đọc được ảnh"));
      img.src = objectUrl;
    });

    const { naturalWidth, naturalHeight } = element;
    if (!naturalWidth || !naturalHeight) return null;

    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(naturalWidth, naturalHeight),
    );
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // JPEG has no alpha, so transparent areas would come out black without this.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(element, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
