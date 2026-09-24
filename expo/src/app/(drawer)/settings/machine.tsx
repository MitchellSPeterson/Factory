import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/factory';
import { pairingBase } from '@/lib/pairing';
import {
  SettingsGroup,
  SettingsIcons,
  SettingsMessage,
  SettingsRow,
  SettingsScroll,
  StatusValue,
} from '@/settings/ui';

export default function MachinePage() {
  const live = useQuery(api.servers.local);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const online = !!(live && now - live.lastSeen < 45_000);
  return (
    <SettingsScroll>
      <SettingsGroup footer="This Mac clones repositories and runs your chats.">
        {live === undefined ? (
          <SettingsMessage>Checking this Mac…</SettingsMessage>
        ) : live ? (
          <SettingsRow icon={SettingsIcons.machine} label={live.name} accessory={<StatusValue online={online} />} />
        ) : (
          <SettingsRow
            icon={SettingsIcons.machine}
            label="Worker"
            accessory={<StatusValue online={false} />}
            detail="Start the Worker on this Mac. It registers itself with this Factory."
          />
        )}
      </SettingsGroup>
      {live ? (
        <SettingsGroup title="Clone Folder" footer="New Projects from GitHub are cloned inside this folder.">
          <CloneFolder path={live.projectsRoot} />
        </SettingsGroup>
      ) : null}
    </SettingsScroll>
  );
}

function CloneFolder({ path }: { path: string }) {
  const theme = useTheme();
  const [value, setValue] = useState(path);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setValue(path);
  }, [path]);
  return (
    <View>
      <View style={styles.clonePad}>
        <TextInput
          accessibilityLabel="Clone folder"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          value={value}
          onChangeText={setValue}
          style={[styles.cloneField, { color: theme.text, borderColor: theme.line }]}
        />
        <View style={styles.cloneActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                const picked = await pickFolderFromWorker();
                setValue(picked);
                await saveProjectsRoot(picked);
                setMessage("");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not change folder.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Choose folder</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                await saveProjectsRoot(value.trim());
                setMessage("Clone folder saved.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save.");
              }
            })();
          }}>
          <ThemedText style={{ color: theme.accent }}>Save</ThemedText>
        </Pressable>
        </View>
        {message ? (
          <ThemedText themeColor="textSecondary" style={styles.cloneHint}>
            {message}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

async function pickFolderFromWorker() {
  const response = await fetch(`${pairingBase("127.0.0.1")}/pick-folder`, { method: "POST" });
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("path" in body) || typeof body.path !== "string") {
    throw new Error("Open Factory on this Mac to change the clone folder.");
  }
  return body.path;
}

async function saveProjectsRoot(projectsRoot: string) {
  if (!projectsRoot) throw new Error("Choose a folder.");
  const response = await fetch(`${pairingBase("127.0.0.1")}/settings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectsRoot }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Open Factory on this Mac to change the clone folder.",
    );
  }
}

const styles = StyleSheet.create({
  clonePad: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  cloneField: { borderWidth: 1, borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  cloneActions: { flexDirection: 'row', gap: 20 },
  cloneHint: { fontSize: 13, lineHeight: 18 },
});
