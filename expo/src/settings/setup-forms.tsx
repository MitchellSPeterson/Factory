import { useMutation } from "@/lib/factory";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import { pairingBase } from "@/lib/pairing";
import { sealSecret, serverVariableNames } from "@/lib/workerSettings";
import { SettingsGroup, SettingsIcons, SettingsMessage, SettingsRow } from "@/settings/ui";

export function PairPhone() {
  const theme = useTheme();
  const [status, setStatus] = useState<{ pairing: string; tailscale: string; tunnel: string; token: string }>({
    pairing: "",
    tailscale: "",
    tunnel: "",
    token: "",
  });
  const [tunnel, setTunnel] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void Promise.all([
      fetch(`${pairingBase("127.0.0.1")}/status`).then((response) => response.json()),
      fetch(`${pairingBase("127.0.0.1")}/pair`).then((response) => response.json()),
    ])
      .then(([statusBody, pairBody]: [unknown, unknown]) => {
        const statusRecord = statusBody && typeof statusBody === "object" ? (statusBody as Record<string, unknown>) : {};
        const pairRecord = pairBody && typeof pairBody === "object" ? (pairBody as Record<string, unknown>) : {};
        setStatus({
          pairing: typeof statusRecord.pairing === "string" ? statusRecord.pairing : "",
          tailscale: typeof statusRecord.tailscale === "string" ? statusRecord.tailscale : "",
          tunnel: typeof statusRecord.tunnel === "string" ? statusRecord.tunnel : "",
          token: typeof pairRecord.token === "string" ? pairRecord.token : "",
        });
        if (typeof statusRecord.tunnel === "string") setTunnel(statusRecord.tunnel);
      })
      .catch(() => {});
  }, []);
  return (
    <>
    <SettingsGroup
      title="Addresses"
      footer="On the same Wi-Fi, pair with the LAN address. On a tailnet, use the Tailscale address. Both need the pairing token.">
      <SettingsRow
        icon={SettingsIcons.wifi}
        label="LAN"
        value={status.pairing || "Start the Worker to see the pairing address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.network}
        label="Tailscale"
        value={status.tailscale || "Join this Mac to a tailnet to see an address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.key}
        label="Pairing token"
        detail={status.token || "Start the Worker to see the household key."}
      />
    </SettingsGroup>
    <SettingsGroup title="Away From Home" footer="Save a public tunnel URL, then pair the phone with that URL and the token above.">
      <View style={styles.pad}>
        <TextInput
          accessibilityLabel="Public tunnel URL"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          placeholder="https://factory.example"
          placeholderTextColor={theme.textSecondary}
          value={tunnel}
          onChangeText={setTunnel}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                const response = await fetch(`${pairingBase("127.0.0.1")}/settings`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ tunnelUrl: tunnel.trim() }),
                });
                const body: unknown = await response.json();
                if (!response.ok) {
                  throw new Error(
                    body && typeof body === "object" && "error" in body && typeof body.error === "string"
                      ? body.error
                      : "Could not save tunnel.",
                  );
                }
                setStatus((current) => ({ ...current, tunnel: tunnel.trim() }));
                setMessage("Tunnel saved. Pair the phone with that URL and the token from /pair.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save tunnel.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Save public tunnel</ThemedText>
        </Pressable>
        {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
      </View>
    </SettingsGroup>
    </>
  );
}

/** One Worker environment value: shows whether it is saved and lets you replace it. */
export function VariableField({
  name,
  label,
  secret,
  placeholder,
  saved,
  publicKey,
}: {
  name: (typeof serverVariableNames)[number];
  label: string;
  secret: boolean;
  placeholder: string;
  saved: boolean;
  publicKey?: string;
}) {
  const theme = useTheme();
  const setVariable = useMutation(api.servers.setVariable);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  return (
    <View style={styles.pad}>
      <View style={styles.fieldHeader}>
        <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
        <ThemedText themeColor={saved ? "success" : "textSecondary"} style={styles.fieldStatus}>
          {saved ? "Saved" : "Not set"}
        </ThemedText>
      </View>
      <View style={styles.fieldRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoComplete={secret ? "new-password" : "off"}
          autoCorrect={false}
          secureTextEntry={secret}
          placeholder={saved ? "Enter a new value to replace it" : placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setMessage("");
          }}
          style={[styles.field, { flex: 1, color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save ${label}`}
          disabled={!value.trim()}
          onPress={() => {
            void (async () => {
              try {
                if (!publicKey) throw new Error("Start the Worker first.");
                await setVariable({ scope: "server", name, sealed: await sealSecret(publicKey, value.trim()) });
                setValue("");
                setMessage("Saved. The Worker picks it up within a minute.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save.");
              }
            })();
          }}
          style={({ pressed }) => [
            styles.save,
            { backgroundColor: theme.accent, opacity: !value.trim() ? 0.4 : pressed ? 0.8 : 1 },
          ]}>
          <ThemedText style={styles.saveLabel}>Save</ThemedText>
        </Pressable>
      </View>
      {message ? <ThemedText themeColor="textSecondary" style={styles.hint}>{message}</ThemedText> : null}
    </View>
  );
}

export function GitHubGroup({
  github,
  disconnectGithub,
}: {
  github: { login: string; token: string } | null | undefined;
  disconnectGithub: () => Promise<null>;
}) {
  const theme = useTheme();
  if (github === undefined) {
    return (
      <SettingsGroup title="GitHub">
        <SettingsMessage>Checking GitHub…</SettingsMessage>
      </SettingsGroup>
    );
  }
  if (!github) {
    return (
      <SettingsGroup title="GitHub" footer="Connect from Clone from GitHub when you add a Project.">
        <SettingsMessage>Not connected.</SettingsMessage>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup title="GitHub" footer="Used to list and clone repositories into the Worker folder.">
      <SettingsRow icon={SettingsIcons.project} label={github.login} value="Connected" />
      <View style={styles.pad}>
        <Pressable accessibilityRole="button" onPress={() => void disconnectGithub()}>
          <ThemedText style={{ color: theme.danger }}>Disconnect</ThemedText>
        </Pressable>
      </View>
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  field: { borderWidth: 1, borderRadius: 10, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  fieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  fieldLabel: { fontSize: 15, lineHeight: 20, fontWeight: 500 },
  fieldStatus: { fontSize: 13, lineHeight: 18 },
  fieldRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  save: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderCurve: "continuous" },
  saveLabel: { color: "#ffffff", fontSize: 15, fontWeight: 600 },
  hint: { fontSize: 13, lineHeight: 18 },
});
