import { buildEpub } from "./epub";
import { fetchProxiedImage } from "./http";
import { buildPdf, type PageSize } from "./pdf";
import { slugify } from "./text";
import type { Chapter, ExportHooks, ScrapeSettings, StoryMeta } from "./types";

export type ExportFormat = "epub" | "pdf";

export interface PdfSettings {
  pageSize: PageSize;
  fontSize: number;
}

export interface ExportRequest extends ExportHooks {
  meta: StoryMeta;
  chapters: Chapter[];
  settings: ScrapeSettings;
  pdf: PdfSettings;
}

export interface ExportedFile {
  filename: string;
  blob: Blob;
}

const BUILDERS: Record<
  ExportFormat,
  (request: ExportRequest) => Promise<Blob>
> = {
  epub: (request) =>
    buildEpub(request.meta, request.chapters, {
      ...hooksOf(request),
      fetchImage: imageFetcherFor(request),
    }),
  pdf: (request) =>
    buildPdf(request.meta, request.chapters, {
      ...hooksOf(request),
      ...request.pdf,
      fetchImage: imageFetcherFor(request),
    }),
};

export async function exportStory(
  format: ExportFormat,
  request: ExportRequest,
): Promise<ExportedFile> {
  return {
    filename: `${slugify(request.meta.title)}.${format}`,
    blob: await BUILDERS[format](request),
  };
}

function hooksOf(request: ExportRequest): ExportHooks {
  return { onStatus: request.onStatus, onWarning: request.onWarning };
}

/** Images always travel through the proxy, whatever the source. */
function imageFetcherFor(request: ExportRequest) {
  if (request.settings.stripImages) return undefined;
  return (url: string) => fetchProxiedImage(url);
}
