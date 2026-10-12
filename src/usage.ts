import { LocalStorage } from "@raycast/api";
import { Skill } from "./skills";

export const USAGE_KEY = "skill-usage";
export const PINS_KEY = "skill-pins";

export type SkillUsage = Record<string, number>;

let queue: Promise<unknown> = Promise.resolve();

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const item = await LocalStorage.getItem<string>(key);
  return item === undefined ? fallback : (JSON.parse(item) as T);
}

/** Read-modify-write against the latest stored value; writes are serialized so none is lost. */
export function updateJSON<T>(
  key: string,
  fallback: T,
  update: (value: T) => T,
): Promise<T> {
  const result = queue.then(async () => {
    const next = update(await readJSON(key, fallback));
    await LocalStorage.setItem(key, JSON.stringify(next));
    return next;
  });
  queue = result.catch(() => undefined);
  return result;
}

export function recordUse(dir: string): Promise<SkillUsage> {
  return updateJSON<SkillUsage>(USAGE_KEY, {}, (usage) => ({
    ...usage,
    [dir]: (usage[dir] ?? 0) + 1,
  }));
}

export function togglePinned(dir: string): Promise<string[]> {
  return updateJSON<string[]>(PINS_KEY, [], (pins) =>
    pins.includes(dir) ? pins.filter((p) => p !== dir) : [...pins, dir],
  );
}

export const TOP_LIMIT = 5;

/** Pinned skills keep their pin order; used skills are sorted by use count (desc), then by name. Each top section holds at most TOP_LIMIT; overflow falls back into `rest`. */
export function rankSkills(
  skills: Skill[],
  usage: SkillUsage,
  pinnedDirs: string[],
) {
  const byDir = new Map(skills.map((s) => [s.dir, s]));
  const allPinned = pinnedDirs.flatMap((dir) => byDir.get(dir) ?? []);
  const pinnedSet = new Set(allPinned.map((s) => s.dir));
  const unpinned = skills.filter((s) => !pinnedSet.has(s.dir));
  const uses = (s: Skill) => usage[s.dir] ?? 0;
  const allFrequent = unpinned
    .filter((s) => uses(s) > 0)
    .sort((a, b) => uses(b) - uses(a) || a.name.localeCompare(b.name));
  const pinned = allPinned.slice(0, TOP_LIMIT);
  const frequent = allFrequent.slice(0, TOP_LIMIT);
  const shown = new Set([...pinned, ...frequent].map((s) => s.dir));
  const rest = skills.filter((s) => !shown.has(s.dir));
  return { pinned, frequent, rest };
}
