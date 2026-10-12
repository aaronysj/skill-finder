import { Skill, tildify } from "./skills";

const RELATED =
  "If a skill refers to related skills, find them in its sibling directories.";

export function buildPrompt(skills: Skill[]): string {
  const files = skills.map((s) => tildify(s.file));
  if (files.length === 1)
    return [`Read ${files[0]} and follow the skill it defines.`, RELATED].join(
      "\n",
    );
  return [
    `Read all ${files.length} skills below before starting, then follow them together:`,
    "",
    ...files.map((f, i) => `${i + 1}. ${f}`),
    "",
    RELATED,
  ].join("\n");
}
