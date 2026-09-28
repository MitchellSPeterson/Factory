import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Input } from "panelui-native/components/input";
import { Spinner } from "panelui-native/components/spinner";
import { Text } from "panelui-native/primitives/text";
import { useMutation } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { Notice } from "@/chats/ui";
import { useChatModels } from "@/chats/model-picker";
import { DEFAULT_AGENT_EFFORT } from "../../../shared/agentModel";
import type { AgentPick } from "../../../shared/helix";
import { AgentPickField, type ChatModelOption } from "@/build/AgentPickField";

export function SendToBuildDialog({
  visible,
  roadmapItemId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  roadmapItemId: Id<"roadmapItems">;
  onClose: () => void;
  onCreated: (id: Id<"builds">) => void;
}) {
  const models = useChatModels();
  const create = useMutation(api.builds.create);

  const [checkCommand, setCheckCommand] = useState("");
  const [agent, setAgent] = useState<AgentPick | null>(null);
  const [reviewerA, setReviewerA] = useState<AgentPick | null>(null);
  const [reviewerB, setReviewerB] = useState<AgentPick | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCheckCommand("");
    setError("");
    setAgent(null);
    setReviewerA(null);
    setReviewerB(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || agent || !models || models.length === 0) return;
    const providers = [...new Set(models.map((m) => m.provider))];
    const first = models[0]!;
    const secondProvider = providers.find((p) => p !== first.provider);
    const second = (secondProvider ? models.find((m) => m.provider === secondProvider) : models[1]) ?? first;
    const pick = (m: ChatModelOption): AgentPick => ({ provider: m.provider, model: m.model, effort: DEFAULT_AGENT_EFFORT });
    setAgent(pick(first));
    setReviewerA(pick(first));
    setReviewerB(pick(second));
  }, [visible, models, agent]);

  async function submit() {
    if (!agent || !reviewerA || !reviewerB || busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await create({
        roadmapItemId,
        checkCommand: checkCommand.trim(),
        agent,
        reviewers: [reviewerA, reviewerB],
      });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start that Build.");
    } finally {
      setBusy(false);
    }
  }

  const ready = !!(agent && reviewerA && reviewerB);

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content className="max-h-[90%] w-full max-w-[460px]">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5">
          <Dialog.Title>Send to Build</Dialog.Title>
          <Dialog.Description>
            Splits this item into Checkpoints and runs each through Behavior, UI, and Review gates. You try the finished Build at the end.
          </Dialog.Description>
          <Input
            label="Check command"
            value={checkCommand}
            onChangeText={setCheckCommand}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="bun run check"
            description="Empty skips the Behavior gate."
          />
          {agent && reviewerA && reviewerB ? (
            <>
              <AgentPickField label="Implementer" value={agent} onChange={setAgent} models={models ?? []} />
              <AgentPickField label="Reviewer A" value={reviewerA} onChange={setReviewerA} models={models ?? []} />
              <AgentPickField label="Reviewer B" value={reviewerB} onChange={setReviewerB} models={models ?? []} />
            </>
          ) : (
            <View className="flex-row items-center gap-2">
              <Spinner size="sm" />
              <Text className="text-sm text-muted-foreground">Loading models from the Worker…</Text>
            </View>
          )}
          {error ? <Notice text={error} error /> : null}
        </ScrollView>
        <Dialog.Footer>
          <Button variant="ghost" onPress={onClose}>Cancel</Button>
          <Button disabled={!ready || busy} onPress={() => void submit()}>
            {busy ? "Starting…" : "Start Build"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
