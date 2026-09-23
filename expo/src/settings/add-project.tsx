import { useAction, useMutation, useQuery } from "@/lib/factory";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { ProjectPicture } from "@/components/project-picture";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { pairingBase } from "@/lib/pairing";
import { useProjectScope } from "@/lib/project-scope-context";
import { sealSecret } from "@/lib/workerSettings";
import {
  nameFromPath,
  nameFromRepo,
  reposForFilter,
  typedRepo,
  type AddStep,
  type GithubRepo,
} from "../../../shared/addProject";

export function useOpenAddedProject() {
  const router = useRouter();
  const { setScope } = useProjectScope();
  return (projectId: string) => {
    setScope({ kind: "project", projectId: projectId as Id<"projects"> });
    router.push("/chats");
  };
}

export function AddProjectFlow({
  onAdded,
  footer,
}: {
  onAdded: (projectId: string) => void;
  footer?: string;
}) {
  const github = useQuery(api.github.connection);
  const [step, setStep] = useState<AddStep>("choose");
  return (
    <View style={styles.stack}>
      {step === "choose" ? (
        <ChooseStep
          footer={footer}
          onFolder={() => setStep("folder")}
          onClone={() => setStep(github ? "github-list" : "github-connect")}
        />
      ) : null}
      {step === "folder" ? <FolderStep onAdded={onAdded} onBack={() => setStep("choose")} /> : null}
      {step === "github-connect" ? (
        <GithubConnectStep
          onBack={() => setStep("choose")}
          onConnected={() => setStep("github-list")}
        />
      ) : null}
      {step === "github-list" ? (
        <GithubListStep onAdded={onAdded} onBack={() => setStep("choose")} />
      ) : null}
    </View>
  );
}

function ChooseStep({
  footer,
  onFolder,
  onClone,
}: {
  footer?: string;
  onFolder: () => void;
  onClone: () => void;
}) {
  return (
    <View style={styles.stack}>
      <PathCard
        label="Use a folder on this Mac"
        detail="Point Factory at a git repository already here."
        onPress={onFolder}
      />
      <PathCard
        label="Clone from GitHub"
        detail="Clone a repository into the Worker folder and add it."
        onPress={onClone}
      />
      {footer ? (
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

function FolderStep({ onAdded, onBack }: { onAdded: (projectId: string) => void; onBack: () => void }) {
  const theme = useTheme();
  const addFolder = useMutation(api.projects.addFolder);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function applyPath(next: string) {
    setPath(next);
    setName((current) => (current.trim() ? current : nameFromPath(next)));
  }

  return (
    <View style={styles.stack}>
      <TextInput
        accessibilityLabel="Folder path"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="/Users/you/code/app"
        placeholderTextColor={theme.textSecondary}
        value={path}
        onChangeText={(text) => {
          setPath(text);
          setName(nameFromPath(text));
        }}
        style={[styles.field, { color: theme.text, borderColor: theme.line }]}
      />
      <TextInput
        accessibilityLabel="Project name"
        autoComplete="off"
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
        value={name}
        onChangeText={setName}
        style={[styles.field, { color: theme.text, borderColor: theme.line }]}
      />
      <ActionButton
        label="Choose folder on this Mac"
        onPress={() => {
          void (async () => {
            try {
              applyPath(await pickFolderFromWorker());
              setMessage("");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Picker failed.");
            }
          })();
        }}
      />
      <ActionButton
        label="Add Project"
        disabled={busy || !path.trim()}
        onPress={() => {
          void (async () => {
            setBusy(true);
            try {
              const id = await addFolder({
                name: name.trim() || nameFromPath(path),
                localPath: path.trim(),
              });
              onAdded(id);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not add Project.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <ActionButton label="Back" quiet onPress={onBack} />
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

function GithubConnectStep({
  onBack,
  onConnected,
}: {
  onBack: () => void;
  onConnected: () => void;
}) {
  const theme = useTheme();
  const connect = useAction(api.github.connect);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        Paste a GitHub token with read-only Contents access.
      </ThemedText>
      <TextInput
        accessibilityLabel="GitHub token"
        autoCapitalize="none"
        autoComplete="new-password"
        autoCorrect={false}
        secureTextEntry
        placeholder="ghp_…"
        placeholderTextColor={theme.textSecondary}
        value={token}
        onChangeText={setToken}
        style={[styles.field, { color: theme.text, borderColor: theme.line }]}
      />
      <ActionButton
        label="Connect GitHub"
        disabled={busy || !token.trim()}
        onPress={() => {
          void (async () => {
            setBusy(true);
            try {
              await connect({ token: token.trim() });
              onConnected();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "GitHub sign-in failed.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <ActionButton label="Back" quiet onPress={onBack} />
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

function GithubListStep({
  onAdded,
  onBack,
}: {
  onAdded: (projectId: string) => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const live = useQuery(api.servers.local);
  const github = useQuery(api.github.connection);
  const listRepos = useAction(api.github.listRepos);
  const importRepo = useMutation(api.servers.importRepository);
  const [repos, setRepos] = useState<GithubRepo[] | undefined>(undefined);
  const [filter, setFilter] = useState("");
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listRepos({})
      .then((rows) => {
        if (!cancelled) setRepos(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRepos([]);
          setMessage(error instanceof Error ? error.message : "Could not list repositories.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listRepos]);

  const shown = reposForFilter(repos ?? [], filter);

  function pick(next: string) {
    setRepo(next);
    setName(nameFromRepo(next));
    setFilter(next);
  }

  return (
    <View style={styles.stack}>
      <TextInput
        accessibilityLabel="Find a GitHub repository"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="owner/repo"
        placeholderTextColor={theme.textSecondary}
        value={filter}
        onChangeText={(text) => {
          setFilter(text);
          const typed = typedRepo(text);
          if (typed) {
            setRepo(typed);
            setName(nameFromRepo(typed));
          }
        }}
        style={[styles.field, { color: theme.text, borderColor: theme.line }]}
      />
      <TextInput
        accessibilityLabel="Project name"
        autoComplete="off"
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
        value={name}
        onChangeText={setName}
        style={[styles.field, { color: theme.text, borderColor: theme.line }]}
      />
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {repos === undefined ? (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            Loading repositories…
          </ThemedText>
        ) : shown.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            No repositories match. Type owner/repo to clone anyway.
          </ThemedText>
        ) : (
          shown.slice(0, 40).map((row) => (
            <Pressable
              key={row.repo}
              accessibilityRole="button"
              onPress={() => pick(row.repo)}
              style={({ pressed }) => [
                styles.repo,
                {
                  borderColor: theme.line,
                  backgroundColor: row.repo.toLowerCase() === repo ? theme.backgroundSelected : "transparent",
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}>
              <ProjectPicture githubRepo={row.repo} name={row.repo} size={22} />
              <View style={styles.repoText}>
                <ThemedText style={styles.repoName}>{row.repo}</ThemedText>
                {row.description ? (
                  <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.repoDetail}>
                    {row.description}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
      <ActionButton
        label="Clone from GitHub"
        disabled={busy || !repo}
        onPress={() => {
          void (async () => {
            setBusy(true);
            try {
              if (!github?.token) throw new Error("Connect GitHub first.");
              if (!live?.publicKey) throw new Error("Start the Worker first.");
              const id = await importRepo({
                repo,
                name: name.trim() || nameFromRepo(repo),
                kind: "web",
                sealedToken: await sealSecret(live.publicKey, github.token),
              });
              onAdded(id);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not clone.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <ActionButton label="Back" quiet onPress={onBack} />
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

function PathCard({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.subtleHover : theme.backgroundElement,
          borderColor: theme.line,
          transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
        },
      ]}>
      <ThemedText style={styles.cardLabel}>{label}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.cardDetail}>
        {detail}
      </ThemedText>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  quiet,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
      })}>
      <ThemedText style={{ color: quiet ? theme.textSecondary : theme.accent, fontSize: 16, lineHeight: 22 }}>
        {label}
      </ThemedText>
    </Pressable>
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
  stack: { gap: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  field: { borderWidth: 1, borderRadius: 10, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  list: { maxHeight: 220 },
  repo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  repoText: { flex: 1, minWidth: 0 },
  repoName: { fontSize: 15, lineHeight: 20 },
  repoDetail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  card: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  cardLabel: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  cardDetail: { fontSize: 14, lineHeight: 20 },
});
