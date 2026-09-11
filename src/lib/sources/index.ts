import type { SourceId, StorySource } from "./types";
import { wordpressSource } from "./wordpress";
import { wattpadSource } from "./wattpad";

export const STORY_SOURCES: readonly StorySource[] = [
  wordpressSource,
  wattpadSource,
];

export const DEFAULT_SOURCE_ID: SourceId = wordpressSource.id;

export type { SourceId, StorySource } from "./types";
