// Opened from a Roadmap Item's "Send to Build" action. Mirrors roadmap/ImportDialog.tsx's shell.
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, useReducedMotion, ZoomIn } from "react-native-reanimated";
import { useMutation } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import { useChatModels } from "@/chats/model-picker";
import { EASE_OUT } from "@/roadmap/meta";
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
  const theme = useTheme();
  const reduced = useReducedMotion();
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
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.overlay}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            entering={reduced ? undefined : ZoomIn.duration(200).easing(EASE_OUT)}
            accessibilityViewIsModal
            style={[styles.dialog, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}
          >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: theme.text }]}>Send to Build</Text>
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                Splits this item into Checkpoints and runs each through Behavior, UI, and Review gates. You try the finished Build at the end.
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Check command</Text>
                <TextInput
                  value={checkCommand}
                  onChangeText={setCheckCommand}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="bun run check"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.background }]}
                />
                <Text style={[styles.hint, { color: theme.textSecondary }]}>Empty skips the Behavior gate.</Text>
              </View>

              {agent && reviewerA && reviewerB ? (
                <>
                  <AgentPickField label="Implementer" value={agent} onChange={setAgent} models={models ?? []} />
                  <AgentPickField label="Reviewer A" value={reviewerA} onChange={setReviewerA} models={models ?? []} />
                  <AgentPickField label="Reviewer B" value={reviewerB} onChange={setReviewerB} models={models ?? []} />
                </>
              ) : (
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Loading models from the Worker…</Text>
              )}

              {error ? <Notice text={error} error /> : null}
              <View style={styles.actions}>
                <Action label="Cancel" onPress={onClose} />
                <Action label={busy ? "Starting…" : "Start Build"} emphasis disabled={!ready || busy} onPress={() => void submit()} />
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", padding: 16 },
  dialog: {
    width: 460,
    maxWidth: "100%",
    maxHeight: "90%",
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: "continuous",
    boxShadow: "0 20px 48px rgba(0,0,0,0.3)",
  },
  scroll: { padding: 20, gap: 14 },
  title: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 13, lineHeight: 19 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600" },
  input: { height: 42, paddingHorizontal: 12, borderRadius: 10, borderCurve: "continuous", borderWidth: 1, fontSize: 14 },
  hint: { fontSize: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 4 },
});
