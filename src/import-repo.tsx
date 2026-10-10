import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { RootEntry } from "./dirs";

const execFileAsync = promisify(execFile);

function repoName(url: string): string | null {
  const m = url.trim().match(/[/:]([\w.-]+?)(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

export function ImportRepo({
  roots,
  onImported,
}: {
  roots: RootEntry[];
  onImported: () => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Import Skills Repo"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Clone Repo"
            onSubmit={async (values) => {
              const url = String(values.url ?? "").trim();
              const target = String(values.target ?? "");
              const name = repoName(url);
              if (!name) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Not a valid repo URL",
                });
                return;
              }
              const dest = path.join(target, name);
              if (fs.existsSync(dest)) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: `${name} already exists in target dir`,
                });
                return;
              }
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: `Cloning ${name}…`,
              });
              try {
                await execFileAsync(
                  "git",
                  ["clone", "--depth", "1", url, dest],
                  { timeout: 120_000 },
                );
                toast.style = Toast.Style.Success;
                toast.title = `Cloned ${name}`;
                onImported();
                pop();
              } catch (error) {
                toast.hide();
                await showFailureToast(error, {
                  title: `Failed to clone ${name}`,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="Repo URL"
        placeholder="https://github.com/user/repo or git@gitlab.com:group/repo"
        info="Cloned with --depth 1. SSH URLs need your local ssh keys."
      />
      <Form.Dropdown id="target" title="Clone Into" storeValue>
        {roots.map((r) => (
          <Form.Dropdown.Item
            key={r.dir}
            value={r.dir}
            title={r.dir}
            icon={Icon.Folder}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
