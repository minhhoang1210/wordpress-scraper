import { hostnameOf } from "../../url";

const WATTPAD_HOST = /(^|\.)wattpad\.com$/;
const STORY_PATH = /^\/story\/(\d+)/;
const PART_PATH = /^\/(\d+)/;

export type WattpadTarget =
  { kind: "story"; storyId: string } | { kind: "part"; partId: string };

export function parseWattpadUrl(input: string): WattpadTarget {
  const hostname = hostnameOf(input);
  if (!hostname || !WATTPAD_HOST.test(hostname)) {
    throw new Error("Liên kết này không phải của wattpad.com.");
  }

  const { pathname } = new URL(input);

  const story = pathname.match(STORY_PATH);
  if (story) return { kind: "story", storyId: story[1] };

  const part = pathname.match(PART_PATH);
  if (part) return { kind: "part", partId: part[1] };

  throw new Error(
    "Không nhận ra dạng liên kết Wattpad này. Hãy dùng liên kết truyện (wattpad.com/story/…) hoặc liên kết một chương.",
  );
}

/** Every part URL starts with the part id: `/25930196-ten-chuong`. */
export function partIdFromUrl(url: string): number | null {
  try {
    const match = new URL(url).pathname.match(PART_PATH);
    return match ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}
