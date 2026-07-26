/** Draws a simple typographic cover so the EPUB shows something in a library grid. */
export async function renderCover(
  title: string,
  author: string,
): Promise<Uint8Array | null> {
  const width = 1200;
  const height = 1800;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1e1b4b");
  gradient.addColorStop(0.55, "#312e81");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, width - 120, height - 120);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f8fafc";

  const lines = wrapText(
    ctx,
    title.toUpperCase(),
    width - 260,
    "bold 76px Georgia, serif",
  );
  const startY = height / 2 - (lines.length * 96) / 2;
  lines.slice(0, 7).forEach((line, index) => {
    ctx.fillText(line, width / 2, startY + index * 96);
  });

  if (author) {
    ctx.font = "italic 44px Georgia, serif";
    ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
    ctx.fillText(truncate(author, 40), width / 2, height - 220);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
