import { fetchJson, fetchPlainText, type RequestOptions } from "../../http";

/**
 * Wattpad publishes no documented API; these are the endpoints its own web
 * client calls. They answer with `Access-Control-Allow-Origin: *`, so the
 * browser reaches them directly and no proxy is involved.
 *
 * `fields` is a projection: nested selections are written `user(name)`, and a
 * field the server does not know is dropped from the response without an error.
 */
const API_ORIGIN = "https://www.wattpad.com";

const STORY_FIELDS = [
  "id",
  "title",
  "description",
  "cover",
  "url",
  "numParts",
  "language(name)",
  "user(name,username)",
  "parts(id,title,url,wordCount,pages,draft)",
].join(",");

export interface WattpadPart {
  id: number;
  title?: string;
  url: string;
  wordCount?: number;
  /** Number of `storytext` pages the part is split into. */
  pages?: number;
  draft?: boolean;
}

export interface WattpadStory {
  id: string;
  title?: string;
  description?: string;
  cover?: string;
  url?: string;
  numParts?: number;
  language?: { name?: string };
  user?: { name?: string; username?: string };
  parts?: WattpadPart[];
}

export function fetchStory(
  storyId: string,
  options: RequestOptions,
): Promise<WattpadStory> {
  return fetchJson<WattpadStory>(
    `${API_ORIGIN}/api/v3/stories/${encodeURIComponent(storyId)}?fields=${STORY_FIELDS}`,
    options,
  );
}

/** A part's `groupId` is the id of the story it belongs to. */
export async function fetchStoryIdForPart(
  partId: string,
  options: RequestOptions,
): Promise<string> {
  const part = await fetchJson<{ groupId?: string }>(
    `${API_ORIGIN}/api/v3/story_parts/${encodeURIComponent(partId)}?fields=id,groupId`,
    options,
  );
  if (!part.groupId) {
    throw new Error(`Không tìm được truyện chứa chương ${partId}.`);
  }
  return part.groupId;
}

/** One page of a part's body, as an HTML fragment. Pages past the last are empty. */
export function fetchPartTextPage(
  partId: number,
  page: number,
  options: RequestOptions,
): Promise<string> {
  return fetchPlainText(
    `${API_ORIGIN}/apiv2/?m=storytext&id=${partId}&page=${page}`,
    options,
  );
}
