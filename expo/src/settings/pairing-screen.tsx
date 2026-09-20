import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { pairFromWorker, writeWorkerPairing, type WorkerPairing } from "@/lib/pairing";

export function PairingScreen({ onReady }: { onReady: (pairing: WorkerPairing) => void }) {
  const theme = useTheme();
  const [workerUrl, setWorkerUrl] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function saveUrl() {
    const next = workerUrl.trim().replace(/\/$/, "");
    const key = token.trim();
    if (!next.startsWith("http://") && !next.startsWith("https://")) {
      setError("Paste a Worker address from Mac Settings — LAN, Tailscale, or a public tunnel.");
      return;
    }
    if (!key) {
      setError("Paste the pairing token from Mac Settings.");
      return;
    }
    const pairing = { url: next, token: key };
    writeWorkerPairing(pairing);
    onReady(pairing);
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
        On the same Wi-Fi or tailnet, type the Mac IP. Away from home, paste the tunnel URL and pairing token from Mac Settings.
      </ThemedText>
      <TextInput
        accessibilityLabel="Worker URL"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://100.x.x.x:3402 or https://factory.example"
        placeholderTextColor={theme.textSecondary}
        value={workerUrl}
        onChangeText={setWorkerUrl}
        style={[styles.field, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
      />
      <TextInput
        accessibilityLabel="Pairing token"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Pairing token"
        placeholderTextColor={theme.textSecondary}
        value={token}
        onChangeText={setToken}
        style={[styles.field, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
      />
      <Pressable accessibilityRole="button" onPress={saveUrl} style={[styles.button, { backgroundColor: theme.accent }]}>
        <ThemedText style={styles.buttonLabel}>Use this Factory</ThemedText>
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
