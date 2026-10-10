import { LocalStorage } from "@raycast/api";
import { expandHome } from "./skills";

const KEY = "skills-dirs";

export async function getExtraDirs(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === "string")
      : [];
  } catch {
    return [];
  }
}

export async function addExtraDir(dir: string): Promise<void> {
  const expanded = expandHome(dir.trim());
  const dirs = await getExtraDirs();
  if (!expanded || dirs.includes(expanded)) return;
  await LocalStorage.setItem(KEY, JSON.stringify([...dirs, expanded]));
}

export async function removeExtraDir(dir: string): Promise<void> {
  const dirs = (await getExtraDirs()).filter((d) => d !== dir);
  await LocalStorage.setItem(KEY, JSON.stringify(dirs));
}

export interface RootEntry {
  dir: string;
  source: "preference" | "custom";
}

export async function getRoots(preferenceRaw: string): Promise<RootEntry[]> {
  const pref = preferenceRaw
    .split(",")
    .map((s) => expandHome(s.trim()))
    .filter(Boolean);
  const extra = await getExtraDirs();
  const seen = new Set<string>();
  const roots: RootEntry[] = [];
  for (const dir of pref) {
    if (!seen.has(dir)) {
      seen.add(dir);
      roots.push({ dir, source: "preference" });
    }
  }
  for (const dir of extra) {
    if (!seen.has(dir)) {
      seen.add(dir);
      roots.push({ dir, source: "custom" });
    }
  }
  return roots;
}
