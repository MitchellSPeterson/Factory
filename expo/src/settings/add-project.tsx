import { useAction, useMutation, useQuery } from "@/lib/factory";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "panelui-native/components/button";
import { Input } from "panelui-native/components/input";
import { Item } from "panelui-native/components/item";
import { Text } from "panelui-native/primitives/text";

import { ProjectPicture } from "@/components/project-picture";
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
    <View className="gap-3">
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
    <View className="gap-3">
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
        <Text size="sm" muted>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

function FolderStep({ onAdded, onBack }: { onAdded: (projectId: string) => void; onBack: () => void }) {
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
    <View className="gap-3">
      <Input
        accessibilityLabel="Folder path"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="/Users/you/code/app"
        value={path}
        onChangeText={(text) => {
          setPath(text);
          setName(nameFromPath(text));
        }}
      />
      <Input
        accessibilityLabel="Project name"
        autoComplete="off"
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <Button
        variant="secondary"
        onPress={() => {
          void (async () => {
            try {
              applyPath(await pickFolderFromWorker());
              setMessage("");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Picker failed.");
            }
          })();
        }}>
        Choose folder on this Mac
      </Button>
      <Button
        loading={busy}
        disabled={!path.trim()}
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
        }}>
        Add Project
      </Button>
      <Button variant="ghost" onPress={onBack}>
        Back
      </Button>
      {message ? (
        <Text size="sm" muted>
          {message}
        </Text>
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
  const connect = useAction(api.github.connect);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-3">
      <Text size="sm" muted>
        Paste a GitHub token with read-only Contents access.
      </Text>
      <Input
        accessibilityLabel="GitHub token"
        autoCapitalize="none"
        autoComplete="new-password"
        autoCorrect={false}
        secureTextEntry
        placeholder="ghp_…"
        value={token}
        onChangeText={setToken}
      />
      <Button
        loading={busy}
        disabled={!token.trim()}
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
        }}>
        Connect GitHub
      </Button>
      <Button variant="ghost" onPress={onBack}>
        Back
      </Button>
      {message ? (
        <Text size="sm" muted>
          {message}
        </Text>
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
    <View className="gap-3">
      <Input
        accessibilityLabel="Find a GitHub repository"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholder="owner/repo"
        value={filter}
        onChangeText={(text) => {
          setFilter(text);
          const typed = typedRepo(text);
          if (typed) {
            setRepo(typed);
            setName(nameFromRepo(typed));
          }
        }}
      />
      <Input
        accessibilityLabel="Project name"
        autoComplete="off"
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <ScrollView className="max-h-[220px]" contentContainerClassName="gap-1.5" keyboardShouldPersistTaps="handled">
        {repos === undefined ? (
          <Text size="sm" muted>
            Loading repositories…
          </Text>
        ) : shown.length === 0 ? (
          <Text size="sm" muted>
            No repositories match. Type owner/repo to clone anyway.
          </Text>
        ) : (
          shown.slice(0, 40).map((row) => (
            <Item
              key={row.repo}
              size="sm"
              variant="outline"
              onPress={() => pick(row.repo)}
              className={row.repo.toLowerCase() === repo ? "bg-muted" : "bg-transparent"}>
              <Item.Media>
                <ProjectPicture githubRepo={row.repo} name={row.repo} size={22} />
              </Item.Media>
              <Item.Content>
                <Item.Title numberOfLines={1}>{row.repo}</Item.Title>
                {row.description ? <Item.Description numberOfLines={1}>{row.description}</Item.Description> : null}
              </Item.Content>
            </Item>
          ))
        )}
      </ScrollView>
      <Button
        loading={busy}
        disabled={!repo}
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
        }}>
        Clone from GitHub
      </Button>
      <Button variant="ghost" onPress={onBack}>
        Back
      </Button>
      {message ? (
        <Text size="sm" muted>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function PathCard({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return (
    <Item variant="outline" onPress={onPress} className="min-h-[72px] bg-card">
      <Item.Content>
        <Item.Title className="text-[17px] font-semibold leading-[22px]">{label}</Item.Title>
        <Item.Description>{detail}</Item.Description>
      </Item.Content>
    </Item>
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
