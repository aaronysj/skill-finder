import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  getPreferenceValues,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  showHUD,
  useNavigation,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import fs from "node:fs";
import { useEffect, useMemo } from "react";
import { getRoots } from "./dirs";
import { ManageDirectories } from "./manage-directories";
import { loadSkills, Skill, tildify } from "./skills";
import {
  PINS_KEY,
  rankSkills,
  readJSON,
  recordUse,
  SkillUsage,
  togglePinned,
  USAGE_KEY,
} from "./usage";

interface Preferences {
  skillsDirs: string;
}

function copyText(skill: Skill): string {
  return [
    `Read ${tildify(skill.file)} and follow the skill it defines.`,
    `If it refers to related skills, find them in its sibling directories.`,
  ].join("\n");
}

export default function Command(props: LaunchProps) {
  const { skillsDirs } = getPreferenceValues<Preferences>();
  const { push } = useNavigation();
  const {
    data: roots = [],
    isLoading: isLoadingRoots,
    revalidate: revalidateRoots,
  } = usePromise((raw: string) => getRoots(raw), [skillsDirs]);
  const {
    data: skills = [],
    isLoading: isLoadingSkills,
    revalidate: revalidateSkills,
  } = usePromise(
    async (entries: typeof roots) => {
      try {
        return loadSkills(entries.map((e) => e.dir));
      } catch (error) {
        await showFailureToast(error, { title: "Failed to scan skills" });
        return [];
      }
    },
    [roots],
  );
  const {
    data: usage = {},
    mutate: mutateUsage,
    isLoading: isLoadingUsage,
  } = usePromise(() => readJSON<SkillUsage>(USAGE_KEY, {}));
  const {
    data: pins = [],
    mutate: mutatePins,
    isLoading: isLoadingPins,
  } = usePromise(() => readJSON<string[]>(PINS_KEY, []));

  const { pinned, frequent, rest } = useMemo(
    () => rankSkills(skills, usage, pins),
    [skills, usage, pins],
  );

  useEffect(() => {
    if (props.launchContext?.page === "manage")
      push(<ManageDirectories skillsDirs={skillsDirs} onChanged={refresh} />);
  }, []);

  const refresh = () => {
    revalidateRoots();
    revalidateSkills();
  };

  const use = (skill: Skill) => mutateUsage(recordUse(skill.dir));

  const copyPathWithNote = async (skill: Skill) => {
    await use(skill);
    await Clipboard.copy(copyText(skill));
    await closeMainWindow();
    await showHUD(`Copied ${skill.name}`);
  };
  const pastePathWithNote = async (skill: Skill) => {
    await use(skill);
    await Clipboard.paste(copyText(skill));
    await closeMainWindow();
  };
  const copyFolder = async (skill: Skill) => {
    await use(skill);
    await Clipboard.copy({ file: skill.dir });
    await closeMainWindow();
    await showHUD(`Copied folder ${skill.name}`);
  };
  const copySkillContent = async (skill: Skill) => {
    await use(skill);
    await Clipboard.copy(fs.readFileSync(skill.file, "utf8"));
    await closeMainWindow();
    await showHUD(`Copied SKILL.md of ${skill.name}`);
  };

  const manageActions = (
    <ActionPanel.Section title="Directories">
      <Action
        title="Manage Directories / Import Repo…"
        icon={Icon.Gear}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
        onAction={() =>
          push(
            <ManageDirectories skillsDirs={skillsDirs} onChanged={refresh} />,
          )
        }
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
    </ActionPanel.Section>
  );

  const renderItem = (skill: Skill, icon?: List.Item.Props["icon"]) => {
    const isPinned = pins.includes(skill.dir);
    return (
      <List.Item
        key={skill.dir}
        title={skill.name}
        accessories={isPinned ? [{ icon: "📌", tooltip: "Pinned" }] : []}
        keywords={[skill.name, skill.description, skill.group, skill.dir]}
        detail={
          <List.Item.Detail
            markdown={
              (skill.body ||
                `# ${skill.name}\n\n${skill.description || "*No content*"}`) +
              `\n\n---\n\n- **Directory** \`${skill.dir}\`\n- **Used** ${usage[skill.dir] ?? 0}×`
            }
          />
        }
        actions={
          <ActionPanel>
            <ActionPanel.Section title="Copy">
              <Action
                title="Copy Skill Prompt"
                icon={Icon.Clipboard}
                onAction={() => copyPathWithNote(skill)}
              />
              <Action
                title="Paste Skill Prompt into Active App"
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd", "opt"], key: "v" }}
                onAction={() => pastePathWithNote(skill)}
              />
              <Action
                title="Copy Folder as File"
                icon={Icon.Folder}
                shortcut={Keyboard.Shortcut.Common.Copy}
                onAction={() => copyFolder(skill)}
              />
              <Action
                title="Copy SKILL.md Content"
                icon={Icon.TextDocument}
                shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
                onAction={() => copySkillContent(skill)}
              />
              <Action.CopyToClipboard
                title="Copy Path Only"
                content={skill.dir}
                shortcut={Keyboard.Shortcut.Common.CopyName}
              />
            </ActionPanel.Section>
            <ActionPanel.Section title="Organize">
              <Action
                title={isPinned ? "Unpin" : "Pin"}
                icon={isPinned ? Icon.PinDisabled : Icon.Pin}
                shortcut={Keyboard.Shortcut.Common.Pin}
                onAction={() => mutatePins(togglePinned(skill.dir))}
              />
            </ActionPanel.Section>
            <ActionPanel.Section title="Open">
              <Action.ShowInFinder path={skill.dir} />
              <Action.Open title="Open SKILL.md" target={skill.file} />
            </ActionPanel.Section>
            {manageActions}
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List
      isLoading={
        isLoadingRoots || isLoadingSkills || isLoadingUsage || isLoadingPins
      }
      isShowingDetail
      searchBarPlaceholder="Search skills by name or description…"
    >
      {skills.length === 0 && !isLoadingSkills ? (
        <List.EmptyView
          title="No skills found"
          description={
            roots.length === 0
              ? "No directories configured. Press ⌘D to add a skills directory."
              : `No SKILL.md found in the configured directories. Press ⌘R to rescan, or ⌘D to change directories.`
          }
          actions={<ActionPanel>{manageActions}</ActionPanel>}
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <List.Section title="Pinned" subtitle={String(pinned.length)}>
              {pinned.map((s) => renderItem(s))}
            </List.Section>
          )}
          {frequent.length > 0 && (
            <List.Section
              title="Frequently Used"
              subtitle={String(frequent.length)}
            >
              {frequent.map((s) => renderItem(s))}
            </List.Section>
          )}
          {rest.length > 0 && (
            <List.Section title="All Skills" subtitle={String(rest.length)}>
              {rest.map((s) => renderItem(s))}
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}
