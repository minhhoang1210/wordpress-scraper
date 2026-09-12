import { parseFragment } from "../html";
import type { Chapter } from "../types";

export interface ChapterText {
  position: number;
  title: string;
  text: string;
}

/** Roughly 20k tokens of Vietnamese, well inside a single free-tier request. */
export const BATCH_CHARS = 60_000;

const MAX_CHAPTER_CHARS = 24_000;

export function chapterTexts(chapters: Chapter[]): ChapterText[] {
  return chapters
    .map((chapter, index) => ({
      position: chapter.order ?? index + 1,
      title: chapter.title ?? chapter.label,
      text: plainText(chapter.html ?? "").slice(0, MAX_CHAPTER_CHARS),
    }))
    .filter((chapter) => chapter.text.length > 0);
}

export function batchChapters(
  chapters: ChapterText[],
  budget = BATCH_CHARS,
): ChapterText[][] {
  const batches: ChapterText[][] = [];
  let current: ChapterText[] = [];
  let size = 0;

  for (const chapter of chapters) {
    if (current.length > 0 && size + chapter.text.length > budget) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(chapter);
    size += chapter.text.length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function plainText(html: string): string {
  return (parseFragment(html).textContent ?? "").replace(/\s+/g, " ").trim();
}
