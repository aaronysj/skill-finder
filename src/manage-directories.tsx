import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import fs from "node:fs";
import { addExtraDir, removeExtraDir, RootEntry } from "./dirs";

function AddDirectoryForm({ onAdded }: { onAdded: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Directory"
            onSubmit={async ({ directory }) => {
              const dir = (directory as string[])?.[0];
              if (!dir || !fs.existsSync(dir)) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Pick a directory",
                });
                return;
              }
              await addExtraDir(dir);
              onAdded();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="directory"
        title="Directory"
        canChooseFiles={false}
        canChooseDirectories
      />
    </Form>
  );
}

export function ManageDirectories({
  roots,
  onChanged,
}: {
  roots: RootEntry[];
  onChanged: () => void;
}) {
  const { push } = useNavigation();
  return (
    <List navigationTitle="Manage Skills Directories">
      {roots.map((root) => (
        <List.Item
          key={root.dir}
          icon={Icon.Folder}
          title={root.dir}
          accessories={[
            { tag: root.source === "preference" ? "Preference" : "Custom" },
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Add Directory…"
                icon={Icon.Plus}
                onAction={() => push(<AddDirectoryForm onAdded={onChanged} />)}
              />
              {root.source === "custom" && (
                <Action
                  title="Remove Directory"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    try {
                      await removeExtraDir(root.dir);
                      onChanged();
                    } catch (error) {
                      await showFailureToast(error);
                    }
                  }}
                />
              )}
              <Action.ShowInFinder path={root.dir} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
