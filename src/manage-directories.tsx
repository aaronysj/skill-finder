import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Alert,
  Icon,
  List,
  showToast,
  Toast,
  Keyboard,
} from "@raycast/api";
import { runAppleScript, showFailureToast, usePromise } from "@raycast/utils";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { useState } from "react";
import { promisify } from "node:util";
import { addExtraDir, getRoots, removeExtraDir, RootEntry } from "./dirs";
import { loadSkills } from "./skills";

const execFileAsync = promisify(execFile);

const GIT_URL = /^(https?:\/\/|ssh:\/\/|git@)\S+$/;

function repoName(url: string): string | null {
  const m = url.match(/[/:]([\w.-]+?)(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

interface RootInfo extends RootEntry {
  exists: boolean;
  count: number;
}

const tildify = (p: string) => {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep)
    ? "~" + p.slice(home.length)
    : p;
};

async function pickDirectory(): Promise<string | undefined> {
  try {
    const out = await runAppleScript(
      'POSIX path of (choose folder with prompt "Choose a skills directory")',
    );
    return out.trim().replace(/\/$/, "") || undefined;
  } catch (error) {
    if (String(error).includes("-128")) return undefined;
    throw error;
  }
}

export function ManageDirectories({
  skillsDirs,
  onChanged,
}: {
  skillsDirs: string;
  onChanged: () => void;
}) {
  const {
    data: roots = [],
    isLoading,
    revalidate,
  } = usePromise(
    async (raw: string): Promise<RootInfo[]> => {
      const entries = await getRoots(raw);
      return entries.map((e) => ({
        ...e,
        exists: fs.existsSync(e.dir),
        count: loadSkills([e.dir]).length,
      }));
    },
    [skillsDirs],
  );

  const [searchText, setSearchText] = useState("");
  const query = searchText.trim();
  const repoUrl = GIT_URL.test(query) ? query : undefined;
  const repo = repoUrl ? repoName(repoUrl) : null;
  const cloneTargets = roots.filter((r) => r.exists);

  const clone = async (url: string, name: string, target: string) => {
    const dest = path.join(target, name);
    if (fs.existsSync(dest)) {
      await showToast({
        style: Toast.Style.Failure,
        title: `${name} already exists`,
        message: tildify(target),
      });
      return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Cloning ${name}…`,
    });
    try {
      await execFileAsync("git", ["clone", "--depth", "1", url, dest], {
        timeout: 120_000,
      });
      toast.style = Toast.Style.Success;
      toast.title = `Cloned ${name}`;
      toast.message = tildify(target);
      setSearchText("");
      changed();
    } catch (error) {
      toast.hide();
      await showFailureToast(error, { title: `Failed to clone ${name}` });
    }
  };

  const changed = () => {
    revalidate();
    onChanged();
  };

  const add = async () => {
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      await addExtraDir(dir);
      await showToast({
        style: Toast.Style.Success,
        title: "Directory added",
        message: tildify(dir),
      });
      changed();
    } catch (error) {
      await showFailureToast(error, { title: "Failed to add directory" });
    }
  };

  const remove = async (dir: string) => {
    if (
      !(await confirmAlert({
        title: "Remove this directory?",
        message: `${tildify(dir)}\n\nThe folder itself is not deleted.`,
        primaryAction: {
          title: "Remove",
          style: Alert.ActionStyle.Destructive,
        },
      }))
    )
      return;
    try {
      await removeExtraDir(dir);
      changed();
    } catch (error) {
      await showFailureToast(error);
    }
  };

  const renderRoot = (root: RootInfo) => (
    <List.Item
      key={root.dir}
      icon={{
        source: root.exists ? Icon.Folder : Icon.ExclamationMark,
        tintColor: root.exists ? Color.Blue : Color.Red,
      }}
      title={path.basename(root.dir) || root.dir}
      subtitle={tildify(path.dirname(root.dir))}
      accessories={[
        root.exists
          ? {
              tag: {
                value: `${root.count} skill${root.count === 1 ? "" : "s"}`,
                color: root.count ? Color.Green : Color.SecondaryText,
              },
            }
          : { tag: { value: "Missing", color: Color.Red } },
      ]}
      actions={
        <ActionPanel>
          <Action.ShowInFinder path={root.dir} />
          <Action
            title="Add Directory…"
            icon={Icon.Plus}
            shortcut={Keyboard.Shortcut.Common.New}
            onAction={add}
          />
          {root.source === "custom" && (
            <Action
              title="Remove Directory"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => remove(root.dir)}
            />
          )}
        </ActionPanel>
      }
    />
  );

  const visible = repoUrl
    ? []
    : roots.filter((r) => r.dir.toLowerCase().includes(query.toLowerCase()));
  const preference = visible.filter((r) => r.source === "preference");
  const custom = visible.filter((r) => r.source === "custom");

  return (
    <List
      navigationTitle="Skills Directories"
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Filter directories, or paste a git URL to import a skills repo…"
    >
      {repoUrl && (
        <List.Section title="Import">
          <List.Item
            icon={{ source: Icon.Download, tintColor: Color.Orange }}
            title={repo ? `Clone ${repo}` : "Not a valid repo URL"}
            subtitle={
              cloneTargets[0]
                ? `into ${tildify(cloneTargets[0].dir)}`
                : "Add a directory first"
            }
            actions={
              <ActionPanel>
                {repo &&
                  cloneTargets.map((r) => (
                    <Action
                      key={r.dir}
                      title={`Clone into ${tildify(r.dir)}`}
                      icon={Icon.Download}
                      onAction={() => clone(repoUrl, repo, r.dir)}
                    />
                  ))}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section>
        <List.Item
          icon={{ source: Icon.PlusCircle, tintColor: Color.Purple }}
          title="Add Directory…"
          subtitle="Pick a folder to scan for SKILL.md"
          actions={
            <ActionPanel>
              <Action title="Choose Folder…" icon={Icon.Plus} onAction={add} />
            </ActionPanel>
          }
        />
      </List.Section>
      {custom.length > 0 && (
        <List.Section title="Custom" subtitle={String(custom.length)}>
          {custom.map(renderRoot)}
        </List.Section>
      )}
      {preference.length > 0 && (
        <List.Section
          title="From Preferences"
          subtitle="edit in extension settings"
        >
          {preference.map(renderRoot)}
        </List.Section>
      )}
    </List>
  );
}
