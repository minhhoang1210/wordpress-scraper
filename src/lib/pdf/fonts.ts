export const FONT_FAMILY = "NotoSans";

export type FontStyle = "normal" | "bold" | "italic";

const FONT_FILES: { file: string; style: FontStyle }[] = [
  { file: "NotoSans-Regular.ttf", style: "normal" },
  { file: "NotoSans-Bold.ttf", style: "bold" },
  { file: "NotoSans-Italic.ttf", style: "italic" },
];

export interface LoadedFont {
  file: string;
  style: FontStyle;
  base64: string;
}

/** Cached across exports so the ~1.7 MB of TTFs download only once per session. */
let fontCache: Promise<LoadedFont[]> | null = null;

/**
 * Loads the Noto Sans faces that get embedded into the PDF. jsPDF's built-in fonts
 * are Latin-1 only, so without these Vietnamese diacritics would be dropped.
 */
export function loadFonts(): Promise<LoadedFont[]> {
  fontCache ??= Promise.all(FONT_FILES.map(loadFont)).catch((error) => {
    // Don't cache a failure — a transient network error should be retryable.
    fontCache = null;
    throw error;
  });
  return fontCache;
}

async function loadFont({
  file,
  style,
}: {
  file: string;
  style: FontStyle;
}): Promise<LoadedFont> {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!response.ok) {
    throw new Error(
      `Không tải được ${file} (HTTP ${response.status}). Tiếng Việt cần phông Noto Sans trong public/fonts.`,
    );
  }
  return {
    file,
    style,
    base64: toBase64(new Uint8Array(await response.arrayBuffer())),
  };
}

function toBase64(bytes: Uint8Array): string {
  // Chunked to stay well under the argument limit of String.fromCharCode.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
