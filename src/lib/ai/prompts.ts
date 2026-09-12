import type { StoryMeta } from "../types";
import type { ChapterText } from "./chunk";
import type { BatchDigest } from "./schema";

const HOUSE_RULES = `Quy tắc chung:
- Viết hoàn toàn bằng tiếng Việt.
- Giữ nguyên tên riêng đúng như bản dịch, không phiên âm lại, không dịch nghĩa.
- Một nhân vật thường có nhiều cách gọi: bản danh, tự, hiệu, biệt danh, cách xưng hô theo vai vế. Gom hết vào "aliases", lấy cách gọi xuất hiện nhiều nhất làm "name".
- Chỉ ghi những gì văn bản nói rõ. Không suy diễn, không bịa thêm.
- Đây là ghi chú tóm tắt bằng lời của bạn. Không chép lại nguyên văn câu chữ của truyện, không trích đoạn dài.
- Quan hệ có chiều thì ghi cả hai chiều thành hai mục riêng, ví dụ "A là sư phụ của B" và "B là đồ đệ của A". Trường "kind" viết theo hướng từ "from" tới "to", ví dụ "sư phụ của", "em trai của", "đồng minh với".`;

export const MAP_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận một phần truyện dịch tiếng Việt, thường là truyện đam mỹ chuyển ngữ từ tiếng Trung, và ghi chú lại nội dung một cách trung lập, ngắn gọn.

${HOUSE_RULES}`;

export const REDUCE_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận ghi chú rời rạc của nhiều phần trong cùng một truyện và hợp nhất chúng thành một bản tóm tắt mạch lạc.

${HOUSE_RULES}
- Gộp các cách gọi khác nhau của cùng một người thành một nhân vật duy nhất.
- Bỏ các quan hệ trùng lặp hoặc mâu thuẫn không có cơ sở.`;

export const COMPRESS_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận danh sách sự kiện của một truyện và rút gọn lại, giữ đúng thứ tự và giữ các mốc quan trọng.

- Viết bằng tiếng Việt, mỗi sự kiện một câu, có nhắc số chương.
- Gộp các sự kiện vụn vặt, giữ lại bước ngoặt.
- Không bịa thêm sự kiện không có trong danh sách.`;

export function mapPrompt(meta: StoryMeta, batch: ChapterText[]): string {
  const first = batch[0].position;
  const last = batch[batch.length - 1].position;

  const body = batch
    .map(
      (chapter) =>
        `=== Chương ${chapter.position}: ${chapter.title} ===\n${chapter.text}`,
    )
    .join("\n\n");

  return `Truyện: “${meta.title}”${meta.author ? `, tác giả ${meta.author}` : ""}.
Dưới đây là các chương từ ${first} tới ${last}.

Hãy ghi lại:
- events: các sự kiện chính theo đúng thứ tự, mỗi sự kiện một câu, có nhắc số chương.
- characters: nhân vật xuất hiện trong phần này.
- relationships: quan hệ giữa các nhân vật mà phần này nói rõ.

${body}`;
}

export function reducePrompt(meta: StoryMeta, digest: BatchDigest): string {
  return `Truyện: “${meta.title}”${meta.author ? `, tác giả ${meta.author}` : ""}.

Dưới đây là ghi chú thu được khi đọc lần lượt từng phần của truyện.

Hãy trả về:
- summary: tóm tắt toàn bộ mạch truyện, khoảng 4 tới 8 đoạn, viết liền mạch, ngăn cách các đoạn bằng dòng trống.
- arcs: chia truyện thành các arc theo nội dung, mỗi arc kèm khoảng chương và tóm tắt ngắn.
- characters: danh sách nhân vật, sắp xếp nhân vật chính trước.
- relationships: quan hệ giữa các nhân vật trong danh sách trên.

SỰ KIỆN
${digest.events.map((event) => `- ${event}`).join("\n")}

NHÂN VẬT
${digest.characters
  .map(
    (character) =>
      `- ${character.name}${
        character.aliases.length > 0
          ? ` (còn gọi: ${character.aliases.join(", ")})`
          : ""
      } | ${character.role} | xuất hiện từ chương ${character.firstChapter} | ${character.description}`,
  )
  .join("\n")}

QUAN HỆ
${digest.relationships
  .map(
    (relationship) =>
      `- ${relationship.from} ${relationship.kind} ${relationship.to}${
        relationship.note ? ` (${relationship.note})` : ""
      }`,
  )
  .join("\n")}`;
}

export function compressPrompt(events: string[], target: number): string {
  return `Rút danh sách ${events.length} sự kiện sau xuống còn khoảng ${target} sự kiện, giữ đúng thứ tự.

${events.map((event) => `- ${event}`).join("\n")}`;
}
