import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Color,
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
import { useEffect, useMemo, useState } from "react";
import { getRoots } from "./dirs";
import { ManageDirectories } from "./manage-directories";
import { buildPrompt } from "./prompt";
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

  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);
  const selected = useMemo(
    () => selectedDirs.flatMap((d) => skills.find((s) => s.dir === d) ?? []),
    [selectedDirs, skills],
  );
  const isMulti = selected.length > 0;
  const toggleSelected = (skill: Skill) =>
    setSelectedDirs((cur) =>
      cur.includes(skill.dir)
        ? cur.filter((d) => d !== skill.dir)
        : [...cur, skill.dir],
    );
  const clearSelected = () => setSelectedDirs([]);

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

  const promptTargets = (skill: Skill) => (isMulti ? selected : [skill]);
  const copyPathWithNote = async (skill: Skill) => {
    const targets = promptTargets(skill);
    await Promise.all(targets.map(use));
    await Clipboard.copy(buildPrompt(targets));
    clearSelected();
    await closeMainWindow();
    await showHUD(
      targets.length > 1
        ? `Copied prompt for ${targets.length} skills`
        : `Copied ${targets[0].name}`,
    );
  };
  const pastePathWithNote = async (skill: Skill) => {
    const targets = promptTargets(skill);
    await Promise.all(targets.map(use));
    await Clipboard.paste(buildPrompt(targets));
    clearSelected();
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

  const renderItem = (skill: Skill) => {
    const isPinned = pins.includes(skill.dir);
    const isSelected = selectedDirs.includes(skill.dir);
    const n = selected.length;
    const copyTitle = isMulti
      ? `Copy Prompt for ${n} Selected Skill${n > 1 ? "s" : ""}`
      : "Copy Skill Prompt";
    const pasteTitle = isMulti
      ? `Paste Prompt for ${n} Selected Skill${n > 1 ? "s" : ""}`
      : "Paste Skill Prompt into Active App";
    const toggle = (
      <Action
        title={isSelected ? "Remove from Selection" : "Add to Selection"}
        icon={isSelected ? Icon.MinusCircle : Icon.PlusCircle}
        shortcut={{ modifiers: ["cmd"], key: "return" }}
        onAction={() => toggleSelected(skill)}
      />
    );
    return (
      <List.Item
        key={skill.dir}
        title={skill.name}
        icon={
          isMulti
            ? isSelected
              ? { source: Icon.CheckCircle, tintColor: Color.Green }
              : Icon.Circle
            : undefined
        }
        keywords={[skill.name, skill.description, skill.group, skill.dir]}
        detail={
          <List.Item.Detail
            markdown={
              (skill.body ||
                `# ${skill.name}\n\n${skill.description || "*No content*"}`) +
              `\n\n---\n\n- **Directory** \`${tildify(skill.dir)}\`\n- **Used** ${usage[skill.dir] ?? 0}×`
            }
          />
        }
        actions={
          <ActionPanel>
            <ActionPanel.Section title={isMulti ? "Selection" : "Copy"}>
              <Action
                title={copyTitle}
                icon={Icon.Clipboard}
                onAction={() => copyPathWithNote(skill)}
              />
              {toggle}
              <Action
                title={pasteTitle}
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
                content={tildify(skill.dir)}
                shortcut={Keyboard.Shortcut.Common.CopyName}
              />
              {isMulti && (
                <Action
                  title="Clear Selection"
                  icon={Icon.XMarkCircle}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                  onAction={clearSelected}
                />
              )}
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
      navigationTitle={
        isMulti ? `${selected.length} skills selected` : undefined
      }
      searchBarPlaceholder={
        isMulti
          ? `${selected.length} selected · ⌘↵ toggle · ↵ copy combined prompt`
          : "Search skills by name or description…"
      }
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
