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

export type JsonSchema = Record<string, unknown>;

const STRING: JsonSchema = { type: "STRING" };
const INTEGER: JsonSchema = { type: "INTEGER" };

const list = (items: JsonSchema): JsonSchema => ({ type: "ARRAY", items });

const CHARACTER: JsonSchema = {
  type: "OBJECT",
  properties: {
    name: STRING,
    aliases: list(STRING),
    role: STRING,
    description: STRING,
    firstChapter: INTEGER,
  },
  required: ["name", "aliases", "role", "description", "firstChapter"],
};

const RELATIONSHIP: JsonSchema = {
  type: "OBJECT",
  properties: { from: STRING, to: STRING, kind: STRING, note: STRING },
  required: ["from", "to", "kind", "note"],
};

const ARC: JsonSchema = {
  type: "OBJECT",
  properties: {
    title: STRING,
    fromChapter: INTEGER,
    toChapter: INTEGER,
    summary: STRING,
  },
  required: ["title", "fromChapter", "toChapter", "summary"],
};

export const BATCH_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    events: list(STRING),
    characters: list(CHARACTER),
    relationships: list(RELATIONSHIP),
  },
  required: ["events", "characters", "relationships"],
};

export const STORY_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    summary: STRING,
    arcs: list(ARC),
    characters: list(CHARACTER),
    relationships: list(RELATIONSHIP),
  },
  required: ["summary", "arcs", "characters", "relationships"],
};

export const EVENTS_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: { events: list(STRING) },
  required: ["events"],
};
