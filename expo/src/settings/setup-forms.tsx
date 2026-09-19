import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import { pairingBase, writeConvexUrl } from "@/lib/convex-url";
import { sealSecret, serverVariableNames } from "@/lib/workerSettings";
import { SettingsGroup, SettingsIcons, SettingsMessage, SettingsRow } from "@/settings/ui";

export function FactorySetup({ publicKey }: { publicKey?: string }) {
  const github = useQuery(api.github.connection);
  const createProject = useMutation(api.projects.create);
  const importRepo = useMutation(api.servers.importRepository);
  const setVariable = useMutation(api.servers.setVariable);
  const saveGithub = useMutation(api.github.save);
  const disconnectGithub = useMutation(api.github.disconnect);
  const beginGithub = useAction(api.github.begin);
  const pollGithub = useAction(api.github.poll);
  return (
    <>
      <PairPhone />
      <ConvexGroup />
      <ProviderKeys publicKey={publicKey} setVariable={setVariable} />
      <AddProject createProject={createProject} importRepo={importRepo} github={github} />
      <GitHubGroup
        github={github}
        saveGithub={saveGithub}
        disconnectGithub={disconnectGithub}
        beginGithub={beginGithub}
        pollGithub={pollGithub}
      />
    </>
  );
}

function PairPhone() {
  const [address, setAddress] = useState("");
  useEffect(() => {
    void fetch(`${pairingBase("127.0.0.1")}/status`)
      .then((response) => response.json())
      .then((body: unknown) => {
        if (body && typeof body === "object" && "pairing" in body && typeof body.pairing === "string") {
          setAddress(body.pairing);
        }
      })
      .catch(() => setAddress(""));
  }, []);
  return (
    <SettingsGroup
      title="Pair a phone"
      footer="On the same Wi-Fi, type this address or the Mac IP on the phone. The Worker hands over the Convex URL.">
      <SettingsRow
        icon={SettingsIcons.machine}
        label="This Mac"
        value={address || "Start the Worker to see the pairing address."}
        valueMode="middle"
      />
    </SettingsGroup>
  );
}

function ConvexGroup() {
  const theme = useTheme();
  const [url, setUrl] = useState("");
  return (
    <SettingsGroup title="Convex" footer="Anyone with this URL can use this Factory. It is the household key.">
      <View style={styles.pad}>
        <TextInput
          accessibilityLabel="Convex URL"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://….convex.cloud"
          placeholderTextColor={theme.textSecondary}
          value={url}
          onChangeText={setUrl}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const next = url.trim();
            if (next.startsWith("https://")) writeConvexUrl(next);
          }}>
          <ThemedText style={{ color: theme.accent }}>Save URL on this device</ThemedText>
        </Pressable>
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
          value={name}
          onChangeText={(text) => setName(text as (typeof serverVariableNames)[number])}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <TextInput
          accessibilityLabel="Setting value"
          autoCapitalize="none"
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

function AddProject({
  createProject,
  importRepo,
  github,
}: {
  createProject: (args: {
    name: string;
    kind: "web" | "expo" | "mixed";
    localPath: string;
    githubRepo: string;
    defaultRuntime: "local";
  }) => Promise<string>;
  importRepo: (args: { repo: string; name: string; kind: "web"; sealedToken: string }) => Promise<string>;
  github: { login: string; token: string } | null | undefined;
}) {
  const theme = useTheme();
  const live = useQuery(api.servers.local);
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [repo, setRepo] = useState("");
  const [message, setMessage] = useState("");
  return (
    <SettingsGroup title="Add a Project" footer="Point at a checkout on this Mac, or clone from GitHub into ~/Factory.">
      <View style={styles.pad}>
        <TextInput
          accessibilityLabel="Project name"
          placeholder="Name"
          placeholderTextColor={theme.textSecondary}
          value={name}
          onChangeText={setName}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <TextInput
          accessibilityLabel="Local path"
          autoCapitalize="none"
          placeholder="/Users/you/code/app"
          placeholderTextColor={theme.textSecondary}
          value={localPath}
          onChangeText={setLocalPath}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                const picked = await pickFolderFromWorker();
                if (picked) setLocalPath(picked);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Picker failed.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Choose folder on this Mac</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                await createProject({
                  name: name.trim() || localPath.split("/").filter(Boolean).at(-1) || "Project",
                  kind: "web",
                  localPath: localPath.trim(),
                  githubRepo: "",
                  defaultRuntime: "local",
                });
                setMessage("Project added.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not add Project.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Add checkout</ThemedText>
        </Pressable>
        <TextInput
          accessibilityLabel="GitHub repository"
          autoCapitalize="none"
          placeholder="owner/repo"
          placeholderTextColor={theme.textSecondary}
          value={repo}
          onChangeText={setRepo}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                if (!github?.token) throw new Error("Connect GitHub first.");
                if (!live?.publicKey) throw new Error("Start the Worker first.");
                await importRepo({
                  repo: repo.trim(),
                  name: name.trim() || repo.trim().split("/")[1] || "Project",
                  kind: "web",
                  sealedToken: await sealSecret(live.publicKey, github.token),
                });
                setMessage("Clone queued.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not clone.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Clone from GitHub</ThemedText>
        </Pressable>
        {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
      </View>
    </SettingsGroup>
  );
}

function GitHubGroup({
  github,
  saveGithub,
  disconnectGithub,
  beginGithub,
  pollGithub,
}: {
  github: { login: string; token: string } | null | undefined;
  saveGithub: (args: { login: string; token: string }) => Promise<null>;
  disconnectGithub: () => Promise<null>;
  beginGithub: (args: { clientId: string }) => Promise<{
    deviceCode: string;
    userCode: string;
    expiresIn: number;
    interval: number;
  }>;
  pollGithub: (args: { clientId: string; deviceCode: string }) => Promise<{
    status: "pending" | "slow_down" | "connected";
    token?: string;
  }>;
}) {
  const theme = useTheme();
  const [clientId, setClientId] = useState("");
  const [userCode, setUserCode] = useState("");
  const [message, setMessage] = useState("");
  if (github === undefined) {
    return (
      <SettingsGroup title="GitHub">
        <SettingsMessage>Checking GitHub…</SettingsMessage>
      </SettingsGroup>
    );
  }
  if (github) {
    return (
      <SettingsGroup title="GitHub" footer="Used to clone repositories into ~/Factory.">
        <SettingsRow icon={SettingsIcons.project} label={github.login} value="Connected" />
        <View style={styles.pad}>
          <Pressable accessibilityRole="button" onPress={() => void disconnectGithub()}>
            <ThemedText style={{ color: theme.danger }}>Disconnect</ThemedText>
          </Pressable>
        </View>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup title="GitHub" footer="Opens GitHub device sign-in. Create a GitHub App with Device Flow and paste its client ID.">
      <View style={styles.pad}>
        <TextInput
          accessibilityLabel="GitHub App client ID"
          autoCapitalize="none"
          placeholder="Iv1.…"
          placeholderTextColor={theme.textSecondary}
          value={clientId}
          onChangeText={setClientId}
          style={[styles.field, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                const started = await beginGithub({ clientId: clientId.trim() });
                setUserCode(started.userCode);
                setMessage(`Enter ${started.userCode} at github.com/login/device`);
                for (;;) {
                  await new Promise((resolve) => setTimeout(resolve, started.interval * 1000));
                  const next = await pollGithub({ clientId: clientId.trim(), deviceCode: started.deviceCode });
                  if (next.status === "connected" && next.token) {
                    await saveGithub({ login: "github", token: next.token });
                    setMessage("GitHub connected.");
                    return;
                  }
                }
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "GitHub sign-in failed.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Connect GitHub</ThemedText>
        </Pressable>
        {userCode ? <ThemedText>Code {userCode}</ThemedText> : null}
        {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
      </View>
    </SettingsGroup>
  );
}

async function pickFolderFromWorker() {
  const response = await fetch(`${pairingBase("127.0.0.1")}/pick-folder`, { method: "POST" });
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("path" in body) || typeof body.path !== "string") {
    throw new Error("Open Factory on this Mac to pick a folder.");
  }
  return body.path;
}

const styles = StyleSheet.create({
  pad: { padding: 12, gap: 10 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
});
