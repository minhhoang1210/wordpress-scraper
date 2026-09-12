import type { BatchDigest, CharacterNote, RelationshipNote } from "./schema";

interface Group {
  keys: Set<string>;
  names: Map<string, { display: string; count: number }>;
  role: string;
  description: string;
  firstChapter: number;
}

const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Folds the per-batch notes into one. Characters are matched on any shared
 * name or alias, which is what keeps a bản danh, a tự and a biệt danh from
 * ending up as three separate people.
 */
export function mergeDigests(digests: BatchDigest[]): BatchDigest {
  const groups: Group[] = [];
  const index = new Map<string, Group>();

  for (const digest of digests) {
    for (const character of digest.characters) absorb(groups, index, character);
  }

  const characters = groups.map(toCharacter);
  const canonical = canonicalNames(groups);

  return {
    events: digests.flatMap((digest) => digest.events),
    characters,
    relationships: dedupeRelationships(
      digests.flatMap((digest) => digest.relationships),
      canonical,
    ),
  };
}

function absorb(
  groups: Group[],
  index: Map<string, Group>,
  character: CharacterNote,
): void {
  const keys = [character.name, ...(character.aliases ?? [])]
    .map(normalize)
    .filter(Boolean);
  if (keys.length === 0) return;

  const matched = [
    ...new Set(keys.map((key) => index.get(key)).filter(Boolean)),
  ];
  const target = (matched[0] as Group | undefined) ?? newGroup(groups);

  for (const other of matched.slice(1) as Group[]) {
    absorbGroup(target, other, index);
    groups.splice(groups.indexOf(other), 1);
  }

  addName(target, character.name, index);
  for (const alias of character.aliases ?? []) addName(target, alias, index);

  if (!target.role && character.role) target.role = character.role;
  if ((character.description ?? "").length > target.description.length) {
    target.description = character.description;
  }
  if (character.firstChapter > 0) {
    target.firstChapter = Math.min(target.firstChapter, character.firstChapter);
  }
}

function newGroup(groups: Group[]): Group {
  const group: Group = {
    keys: new Set(),
    names: new Map(),
    role: "",
    description: "",
    firstChapter: Number.MAX_SAFE_INTEGER,
  };
  groups.push(group);
  return group;
}

function addName(group: Group, name: string, index: Map<string, Group>): void {
  const key = normalize(name);
  if (!key) return;

  group.keys.add(key);
  index.set(key, group);

  const seen = group.names.get(key);
  if (seen) seen.count += 1;
  else group.names.set(key, { display: name.trim(), count: 1 });
}

function absorbGroup(
  target: Group,
  other: Group,
  index: Map<string, Group>,
): void {
  for (const key of other.keys) {
    target.keys.add(key);
    index.set(key, target);
  }
  for (const [key, entry] of other.names) {
    const seen = target.names.get(key);
    if (seen) seen.count += entry.count;
    else target.names.set(key, entry);
  }
  if (!target.role) target.role = other.role;
  if (other.description.length > target.description.length) {
    target.description = other.description;
  }
  target.firstChapter = Math.min(target.firstChapter, other.firstChapter);
}

function toCharacter(group: Group): CharacterNote {
  const ranked = [...group.names.values()].sort((a, b) => b.count - a.count);
  const [primary, ...rest] = ranked;

  return {
    name: primary?.display ?? "",
    aliases: rest.map((entry) => entry.display),
    role: group.role,
    description: group.description,
    firstChapter:
      group.firstChapter === Number.MAX_SAFE_INTEGER ? 0 : group.firstChapter,
  };
}

function canonicalNames(groups: Group[]): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const group of groups) {
    const name = toCharacter(group).name;
    for (const key of group.keys) canonical.set(key, name);
  }
  return canonical;
}

function dedupeRelationships(
  relationships: RelationshipNote[],
  canonical: Map<string, string>,
): RelationshipNote[] {
  const seen = new Map<string, RelationshipNote>();

  for (const relationship of relationships) {
    const from =
      canonical.get(normalize(relationship.from)) ?? relationship.from;
    const to = canonical.get(normalize(relationship.to)) ?? relationship.to;
    if (!from || !to || normalize(from) === normalize(to)) continue;

    const key = `${normalize(from)}|${normalize(to)}|${normalize(relationship.kind)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...relationship, from, to });
    } else if (
      (relationship.note ?? "").length > (existing.note ?? "").length
    ) {
      existing.note = relationship.note;
    }
  }

  return [...seen.values()];
}
