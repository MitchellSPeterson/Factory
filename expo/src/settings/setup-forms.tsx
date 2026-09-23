import { useMutation, useQuery } from "@/lib/factory";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import { pairingBase } from "@/lib/pairing";
import { sealSecret, serverVariableNames } from "@/lib/workerSettings";
import { AddProjectFlow, useOpenAddedProject } from "@/settings/add-project";
import { SettingsGroup, SettingsIcons, SettingsMessage, SettingsRow } from "@/settings/ui";

export function FactorySetup({ publicKey }: { publicKey?: string }) {
  const github = useQuery(api.github.connection);
  const setVariable = useMutation(api.servers.setVariable);
  const disconnectGithub = useMutation(api.github.disconnect);
  const openAdded = useOpenAddedProject();
  return (
    <>
      <PairPhone />
      <ProviderKeys publicKey={publicKey} setVariable={setVariable} />
      <SettingsGroup title="Add a Project" footer="Use a folder on this Mac, or clone from GitHub into the Worker folder.">
        <View style={styles.pad}>
          <AddProjectFlow onAdded={openAdded} />
        </View>
      </SettingsGroup>
      <GitHubGroup github={github} disconnectGithub={disconnectGithub} />
    </>
  );
}

function PairPhone() {
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
    <SettingsGroup
      title="Pair a phone"
      footer="How a phone learns which Factory. Same Wi-Fi uses the LAN address. A tailnet uses the Tailscale row. Away from home, save a public tunnel URL.">
      <SettingsRow
        icon={SettingsIcons.machine}
        label="LAN"
        value={status.pairing || "Start the Worker to see the pairing address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.machine}
        label="Tailscale"
        value={status.tailscale || "Join this Mac to a tailnet to see an address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.machine}
        label="Pairing token"
        value={status.token || "Start the Worker to see the household key."}
        valueMode="middle"
      />
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
  );
}

function ProviderKeys({
  publicKey,
  setVariable,
}: {
  publicKey?: string;
  setVariable: (args: { scope: string; name: string; sealed: string }) => Promise<null>;
}) {
  const theme = useTheme();
  const [name, setName] = useState<(typeof serverVariableNames)[number]>("CURSOR_API_KEY");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  return (
    <SettingsGroup
      title="Providers"
      footer="Cursor, Codex, Grok, Claude Code, and OpenAI-compatible. Keys stay on this Worker.">
      <View style={styles.pad}>
        <TextInput
          accessibilityLabel="Setting name"
          autoCapitalize="none"
          autoComplete="off"
          value={name}
          onChangeText={(text) => setName(text as (typeof serverVariableNames)[number])}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <TextInput
          accessibilityLabel="Setting value"
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          secureTextEntry
          placeholder="Paste a key or path"
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={setValue}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                if (!publicKey) throw new Error("Start the Worker first.");
                if (!(serverVariableNames as readonly string[]).includes(name)) {
                  throw new Error("Use a supported Worker setting name.");
                }
                await setVariable({ scope: "server", name, sealed: await sealSecret(publicKey, value) });
                setValue("");
                setMessage(`Saved ${name}.`);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Save provider setting</ThemedText>
        </Pressable>
        {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
      </View>
    </SettingsGroup>
  );
}

function GitHubGroup({
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
  pad: { padding: 12, gap: 10 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
});
