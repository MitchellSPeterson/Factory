// Import a GitHub issue as a Roadmap Item. Opened from the Roadmap's ⋯ menu.
import { useEffect, useState } from "react";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Input } from "panelui-native/components/input";
import { useAction } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { Notice } from "@/chats/ui";

export function ImportDialog({
  projectId,
  visible,
  onClose,
  onImported,
}: {
  projectId: Id<"projects">;
  visible: boolean;
  onClose: () => void;
  onImported: (id: Id<"roadmapItems">) => void;
}) {
  const importIssue = useAction(api.roadmap.importIssue);
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRef("");
    setError("");
  }, [visible]);

  async function submit() {
    const text = ref.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      onImported(await importIssue({ projectId, ref: text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that issue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content className="w-full max-w-[420px] gap-2.5">
        <Dialog.Title>Import GitHub issue</Dialog.Title>
        <Dialog.Description>
          The issue's title, body, and labels become a Roadmap item. Checklist lines become Requirements.
        </Dialog.Description>
        <Input
          value={ref}
          onChangeText={setRef}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#123, owner/repo#123, or issue URL"
          onSubmitEditing={() => void submit()}
          avoidKeyboard
        />
        {error ? <Notice text={error} error /> : null}
        <Dialog.Footer>
          <Button variant="ghost" onPress={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ref.trim() || busy} onPress={() => void submit()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
