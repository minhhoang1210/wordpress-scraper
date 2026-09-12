export interface CharacterNote {
  name: string;
  aliases: string[];
  role: string;
  description: string;
  firstChapter: number;
}

export interface RelationshipNote {
  from: string;
  to: string;
  kind: string;
  note: string;
}

export interface ArcNote {
  title: string;
  fromChapter: number;
  toChapter: number;
  summary: string;
}

/** What one batch of chapters yields before everything is folded together. */
export interface BatchDigest {
  events: string[];
  characters: CharacterNote[];
  relationships: RelationshipNote[];
}

export interface StoryDigest {
  summary: string;
  arcs: ArcNote[];
  characters: CharacterNote[];
  relationships: RelationshipNote[];
}

/**
 * How long an answer may get. The prompts and the response schemas both quote
 * these numbers, so tuning length happens here and nowhere else.
 */
export const LIMITS = {
  summaryWords: 180,
  summaryParagraphs: 3,
  arcCount: 6,
  arcWords: 30,
  characterWords: 25,
  noteWords: 10,
  eventWords: 25,
  eventsPerBatch: 8,
};

export type JsonSchema = Record<string, unknown>;

const STRING: JsonSchema = { type: "STRING" };
const INTEGER: JsonSchema = { type: "INTEGER" };

const text = (description: string): JsonSchema => ({
  type: "STRING",
  description,
});

const list = (items: JsonSchema, description?: string): JsonSchema =>
  description
    ? { type: "ARRAY", items, description }
    : { type: "ARRAY", items };

const CHARACTER: JsonSchema = {
  type: "OBJECT",
  properties: {
    name: text("Cách gọi hay dùng nhất, chỉ tên, không mô tả."),
    aliases: list(STRING, "Các cách gọi khác, mỗi mục chỉ là một cái tên."),
    role: text("Vai trò trong truyện, nhiều nhất 4 từ."),
    description: text(
      `Giới thiệu nhân vật trong 1 câu, nhiều nhất ${LIMITS.characterWords} từ.`,
    ),
    firstChapter: INTEGER,
  },
  required: ["name", "aliases", "role", "description", "firstChapter"],
};

const RELATIONSHIP: JsonSchema = {
  type: "OBJECT",
  properties: {
    from: STRING,
    to: STRING,
    kind: text("Quan hệ theo hướng từ from tới to, nhiều nhất 4 từ."),
    note: text(
      `Chú thích ngắn, nhiều nhất ${LIMITS.noteWords} từ. Để trống nếu không có gì đáng nói.`,
    ),
  },
  required: ["from", "to", "kind", "note"],
};

const ARC: JsonSchema = {
  type: "OBJECT",
  properties: {
    title: text("Tên phần, nhiều nhất 5 từ."),
    fromChapter: INTEGER,
    toChapter: INTEGER,
    summary: text(
      `Tóm tắt phần này trong 1 câu, nhiều nhất ${LIMITS.arcWords} từ.`,
    ),
  },
  required: ["title", "fromChapter", "toChapter", "summary"],
};

const EVENT = text(
  `Một sự kiện trong 1 câu, nhiều nhất ${LIMITS.eventWords} từ, có nhắc số chương.`,
);

export const BATCH_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    events: list(
      EVENT,
      `Nhiều nhất ${LIMITS.eventsPerBatch} sự kiện đáng kể nhất, theo thứ tự.`,
    ),
    characters: list(CHARACTER, "Chỉ nhân vật có vai trò rõ ràng."),
    relationships: list(RELATIONSHIP, "Chỉ quan hệ được nói rõ."),
  },
  required: ["events", "characters", "relationships"],
};

export const STORY_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    summary: text(
      `Tóm tắt mạch truyện trong đúng ${LIMITS.summaryParagraphs} đoạn, mỗi đoạn 2 tới 3 câu, ` +
        `tổng cộng nhiều nhất ${LIMITS.summaryWords} từ. Ngăn cách các đoạn bằng một dòng trống.`,
    ),
    arcs: list(ARC, `Nhiều nhất ${LIMITS.arcCount} phần.`),
    characters: list(CHARACTER, "Nhân vật chính trước, nhân vật phụ sau."),
    relationships: list(RELATIONSHIP, "Chỉ quan hệ giữa các nhân vật kể trên."),
  },
  required: ["summary", "arcs", "characters", "relationships"],
};

export const EVENTS_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: { events: list(EVENT) },
  required: ["events"],
};
