import { useState } from "react";
import { View } from "react-native";

import { Button } from "panelui-native/components/button";
import { Input } from "panelui-native/components/input";
import { Text } from "panelui-native/primitives/text";

import { pairFromWorker, writeWorkerPairing, type WorkerPairing } from "@/lib/pairing";

export function PairingScreen({ onReady }: { onReady: (pairing: WorkerPairing) => void }) {
  const [workerUrl, setWorkerUrl] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [code, setCode] = useState("");
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
      onReady(await pairFromWorker(host, code));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the Mac.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 justify-center gap-3 bg-background p-6">
      <Text size="2xl" weight="semibold" className="mb-1">
        Connect this phone
      </Text>
      <Text muted className="mb-2 text-base leading-6">
        On the same Wi-Fi or tailnet, type the Mac IP. Away from home, paste the tunnel URL and pairing token from Mac Settings.
      </Text>
      <Input
        accessibilityLabel="Worker URL"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="http://100.x.x.x:3402 or https://factory.example"
        value={workerUrl}
        onChangeText={setWorkerUrl}
      />
      <Input
        accessibilityLabel="Pairing token"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="Pairing token"
        value={token}
        onChangeText={setToken}
      />
      <Button onPress={saveUrl}>Use this Factory</Button>
      <Text muted className="mt-2 text-center">
        or pair by IP
      </Text>
      <Input
        accessibilityLabel="Mac IP"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="192.168.1.20"
        value={host}
        onChangeText={setHost}
      />
      <Input
        accessibilityLabel="Pairing code"
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={6}
        placeholder="6-digit code from Mac Settings"
        value={code}
        onChangeText={setCode}
      />
      <Button variant="secondary" loading={busy} onPress={() => void pair()}>
        Ask the Mac for its URL
      </Button>
      {error ? (
        <Text className="mt-2 text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
