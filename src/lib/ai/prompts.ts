import type { StoryMeta } from "../types";
import type { ChapterText } from "./chunk";
import { LIMITS, type BatchDigest } from "./schema";

const HOUSE_RULES = `Quy tắc chung:
- Viết hoàn toàn bằng tiếng Việt.
- Viết ngắn. Mỗi trường chỉ một câu gọn, không mở bài, không kết luận, không lặp lại ý đã nói ở trường khác. Thà thiếu còn hơn dài dòng.
- Giữ nguyên tên riêng đúng như bản dịch, không phiên âm lại, không dịch nghĩa.
- Một nhân vật thường có nhiều cách gọi: bản danh, tự, hiệu, biệt danh, cách xưng hô theo vai vế. Gom hết vào "aliases", lấy cách gọi xuất hiện nhiều nhất làm "name".
- Chỉ ghi những gì văn bản nói rõ. Không suy diễn, không bịa thêm.
- Đây là ghi chú tóm tắt bằng lời của bạn. Không chép lại nguyên văn câu chữ của truyện, không trích đoạn dài.
- Quan hệ có chiều thì ghi cả hai chiều thành hai mục riêng, ví dụ "A là sư phụ của B" và "B là đồ đệ của A". Trường "kind" viết theo hướng từ "from" tới "to", ví dụ "sư phụ của", "em trai của", "đồng minh với".`;

export const MAP_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận một phần truyện dịch tiếng Việt, thường là truyện đam mỹ chuyển ngữ từ tiếng Trung, và ghi chú lại nội dung một cách trung lập, ngắn gọn.

${HOUSE_RULES}
- Chỉ giữ lại ${LIMITS.eventsPerBatch} sự kiện đáng kể nhất của phần này. Chuyện vụn vặt thì bỏ.
- Chỉ ghi nhân vật có vai trò rõ ràng. Người chỉ được nhắc thoáng qua thì bỏ.`;

export const REDUCE_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận ghi chú rời rạc của nhiều phần trong cùng một truyện và hợp nhất chúng thành một bản tóm tắt ngắn gọn.

${HOUSE_RULES}
- Gộp các cách gọi khác nhau của cùng một người thành một nhân vật duy nhất.
- Bỏ các quan hệ trùng lặp hoặc mâu thuẫn không có cơ sở.
- Bản tóm tắt phải đọc hết trong khoảng một phút. Chỉ giữ mạch chính, bỏ tình tiết phụ.`;

export const COMPRESS_SYSTEM = `Bạn là trợ lý đọc truyện. Bạn nhận danh sách sự kiện của một truyện và rút gọn lại, giữ đúng thứ tự và giữ các mốc quan trọng.

- Viết bằng tiếng Việt, mỗi sự kiện một câu, nhiều nhất ${LIMITS.eventWords} từ, có nhắc số chương.
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
- events: nhiều nhất ${LIMITS.eventsPerBatch} sự kiện chính theo đúng thứ tự, mỗi sự kiện một câu nhiều nhất ${LIMITS.eventWords} từ, có nhắc số chương.
- characters: nhân vật có vai trò rõ ràng trong phần này, mỗi người một câu nhiều nhất ${LIMITS.characterWords} từ.
- relationships: quan hệ giữa các nhân vật mà phần này nói rõ.

${body}`;
}

export function reducePrompt(meta: StoryMeta, digest: BatchDigest): string {
  return `Truyện: “${meta.title}”${meta.author ? `, tác giả ${meta.author}` : ""}.

Dưới đây là ghi chú thu được khi đọc lần lượt từng phần của truyện.

Hãy trả về:
- summary: tóm tắt toàn bộ mạch truyện trong đúng ${LIMITS.summaryParagraphs} đoạn, mỗi đoạn 2 tới 3 câu, tổng cộng nhiều nhất ${LIMITS.summaryWords} từ, ngăn cách các đoạn bằng dòng trống.
- arcs: chia truyện thành nhiều nhất ${LIMITS.arcCount} phần, mỗi phần kèm khoảng chương và một câu tóm tắt nhiều nhất ${LIMITS.arcWords} từ.
- characters: danh sách nhân vật, nhân vật chính trước, mỗi người một câu nhiều nhất ${LIMITS.characterWords} từ.
- relationships: quan hệ giữa các nhân vật trong danh sách trên, chú thích nhiều nhất ${LIMITS.noteWords} từ.

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
  return `Rút danh sách ${events.length} sự kiện sau xuống còn khoảng ${target} sự kiện, giữ đúng thứ tự, mỗi sự kiện nhiều nhất ${LIMITS.eventWords} từ.

${events.map((event) => `- ${event}`).join("\n")}`;
}
