import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { pairFromWorker, writeConvexUrl } from "@/lib/convex-url";

export function PairingScreen({ onReady }: { onReady: (url: string) => void }) {
  const theme = useTheme();
  const [convexUrl, setConvexUrl] = useState("");
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveUrl() {
    const next = convexUrl.trim();
    if (!next.startsWith("https://") || !next.includes("convex")) {
      setError("Paste the Convex URL from Mac Settings.");
      return;
    }
    writeConvexUrl(next);
    onReady(next);
  }

  async function pair() {
    setBusy(true);
    setError("");
    try {
      onReady(await pairFromWorker(host));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the Mac.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.sidebar }]}>
      <ThemedText type="heading" style={styles.title}>
        Connect this phone
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.copy}>
        Type the Convex URL from Mac Settings. On the same Wi-Fi you can type the Mac IP instead.
      </ThemedText>
      <TextInput
        accessibilityLabel="Convex URL"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://….convex.cloud"
        placeholderTextColor={theme.textSecondary}
        value={convexUrl}
        onChangeText={setConvexUrl}
        style={[styles.field, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
      />
      <Pressable accessibilityRole="button" onPress={() => void saveUrl()} style={[styles.button, { backgroundColor: theme.accent }]}>
        <ThemedText style={styles.buttonLabel}>Use this URL</ThemedText>
      </Pressable>
      <ThemedText themeColor="textSecondary" style={styles.or}>
        or pair by IP
      </ThemedText>
      <TextInput
        accessibilityLabel="Mac IP"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="192.168.1.20"
        placeholderTextColor={theme.textSecondary}
        value={host}
        onChangeText={setHost}
        style={[styles.field, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void pair()}
        style={[styles.button, { backgroundColor: theme.backgroundElement, opacity: busy ? 0.6 : 1 }]}>
        <ThemedText>Ask the Mac for its URL</ThemedText>
      </Pressable>
      {error ? (
        <ThemedText themeColor="danger" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28 },
  copy: { fontSize: 16, lineHeight: 22, marginBottom: 8 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonLabel: { color: "#fff", fontWeight: "600" },
  or: { textAlign: "center", marginTop: 8 },
  error: { marginTop: 8 },
});
