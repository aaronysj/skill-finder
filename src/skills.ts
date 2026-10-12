import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Skill {
  name: string;
  description: string;
  body: string;
  dir: string;
  parent: string;
  file: string;
  root: string;
  group: string;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".trash", "dist", ".next"]);
const MAX_DEPTH = 8;

export function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function tildify(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep)
    ? "~" + p.slice(home.length)
    : p;
}

export function loadSkills(roots: string[]): Skill[] {
  const skills: Skill[] = [];
  for (const raw of roots) {
    const root = expandHome(raw.trim());
    if (!root || !fs.existsSync(root)) continue;
    walk(root, root, 0, skills);
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function walk(root: string, dir: string, depth: number, out: Skill[]) {
  if (depth > MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) {
    const file = path.join(dir, "SKILL.md");
    const meta = parseSkillFile(file);
    out.push({
      name: meta.name ?? path.basename(dir),
      description: meta.description ?? "",
      body: meta.body ?? "",
      dir,
      parent: path.dirname(dir),
      file,
      root,
      group: path.relative(root, dir),
    });
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name))
      continue;
    walk(root, path.join(dir, e.name), depth + 1, out);
  }
}

const MAX_FILE_BYTES = 64 * 1024;

interface SkillMeta {
  name?: string;
  description?: string;
  body?: string;
}

function parseSkillFile(file: string): SkillMeta {
  let text: string;
  try {
    const stat = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(stat.size, MAX_FILE_BYTES));
    const len = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    text = buf.toString("utf8", 0, len);
  } catch {
    return {};
  }
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const body = m ? text.slice(m[0].length).trim() : "";
  const meta = m ? parseFrontmatter(m[1]) : {};
  return { ...meta, body };
}

function parseFrontmatter(fm: string): {
  name?: string;
  description?: string;
} {
  const lines = fm.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === ">-" || value === ">" || value === "|-" || value === "|") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        block.push(lines[++i].trim());
      }
      out[key] = block.join(" ");
    } else {
      out[key] = value.replace(/^["']|["']$/g, "").trim();
    }
  }
  return { name: out.name, description: out.description };
}
