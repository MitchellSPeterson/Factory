// Import a GitHub issue as a Roadmap Item. Opened from the Roadmap's ⋯ menu.
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, useReducedMotion, ZoomIn } from "react-native-reanimated";
import { useAction } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import { EASE_OUT } from "./meta";

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
  const theme = useTheme();
  const reduced = useReducedMotion();
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
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.overlay}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            entering={reduced ? undefined : ZoomIn.duration(200).easing(EASE_OUT)}
            accessibilityViewIsModal
            style={[styles.dialog, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}
          >
            <Text style={[styles.title, { color: theme.text }]}>Import GitHub issue</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              The issue's title, body, and labels become a Roadmap item. Checklist lines become Requirements.
            </Text>
            <TextInput
              value={ref}
              onChangeText={setRef}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="#123, owner/repo#123, or issue URL"
              placeholderTextColor={theme.textSecondary}
              onSubmitEditing={() => void submit()}
              style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.background }]}
            />
            {error ? <Notice text={error} error /> : null}
            <View style={styles.actions}>
              <Action label="Cancel" onPress={onClose} />
              <Action label={busy ? "Importing…" : "Import"} emphasis disabled={!ref.trim() || busy} onPress={() => void submit()} />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", padding: 16 },
  dialog: {
    width: 420,
    maxWidth: "100%",
    alignSelf: "center",
    padding: 20,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: "continuous",
    boxShadow: "0 20px 48px rgba(0,0,0,0.3)",
  },
  title: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 13, lineHeight: 19 },
  input: { height: 42, paddingHorizontal: 12, borderRadius: 10, borderCurve: "continuous", borderWidth: 1, fontSize: 14 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 4 },
});
