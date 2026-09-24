import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProjectPicture } from '@/components/project-picture';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { ProviderMeter } from '@/lib/dataModel';
import { useQuery } from '@/lib/factory';
import { useProjectScope } from '@/lib/project-scope-context';
import { formatTokens, formatUsdCents } from '@/settings/format';
import {
  AppearanceSwitcher,
  SettingsGroup,
  SettingsIcons,
  SettingsRow,
  SettingsScroll,
  StatusValue,
} from '@/settings/ui';
import { providerLabel } from '../../../../../shared/agentModel';

export default function SettingsPage() {
  const router = useRouter();
  const live = useQuery(api.servers.local);
  const github = useQuery(api.github.connection);
  const { scope, currentProject } = useProjectScope();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const online = !!(live && now - live.lastSeen < 45_000);
  const ready = (live?.providerModels ?? []).filter((row) => row.enabled && row.authenticated).length;
  const tightest = tightestMeter(live?.providerUsage?.meters ?? []);

  return (
    <SettingsScroll>
      <MachineCard
        name={live?.name}
        online={online}
        folder={live?.projectsRoot}
        checking={live === undefined}
        onPress={() => router.push('/settings/machine')}
      />

      <SettingsGroup title="AI">
        <SettingsRow
          icon={SettingsIcons.providers}
          label="Providers"
          value={live?.providerModels ? `${ready} ready` : undefined}
          onPress={() => router.push('/settings/providers')}
        />
        <SettingsRow
          icon={SettingsIcons.chart}
          label="Usage"
          value={tightest ? `${providerLabel(tightest.meter.provider)} · ${tightest.summary}` : undefined}
          onPress={() => router.push('/settings/usage')}
        />
      </SettingsGroup>

      <SettingsGroup title="Projects">
        {scope.kind === 'project' && currentProject ? (
          <SettingsRow
            leading={<ProjectPicture githubRepo={currentProject.githubRepo} name={currentProject.name} />}
            label={currentProject.name}
            value="Current"
            onPress={() => router.push('/settings/projects')}
          />
        ) : (
          <SettingsRow
            icon={SettingsIcons.project}
            label="All Projects"
            onPress={() => router.push('/settings/projects')}
          />
        )}
        <SettingsRow
          icon={SettingsIcons.link}
          label="GitHub"
          value={github === undefined ? undefined : github ? github.login : 'Not connected'}
          onPress={() => router.push('/settings/projects')}
        />
      </SettingsGroup>

      <SettingsGroup title="Devices">
        <SettingsRow
          icon={SettingsIcons.phone}
          label="Pair a Phone"
          onPress={() => router.push('/settings/pairing')}
        />
      </SettingsGroup>

      <AppearanceSwitcher />
    </SettingsScroll>
  );
}

function MachineCard({
  name,
  online,
  folder,
  checking,
  onPress,
}: {
  name?: string;
  online: boolean;
  folder?: string;
  checking: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name ?? 'Worker'}, ${online ? 'online' : 'offline'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <View style={[styles.cardIcon, { backgroundColor: theme.sidebar }]}>
        <SymbolView name={SettingsIcons.machine} size={28} tintColor={theme.text} />
      </View>
      <View style={styles.cardText}>
        <ThemedText numberOfLines={1} style={styles.cardTitle}>
          {checking ? 'Checking this Mac…' : name ?? 'Worker not running'}
        </ThemedText>
        {name ? <StatusValue online={online} /> : null}
        <ThemedText themeColor="textSecondary" numberOfLines={1} ellipsizeMode="middle" style={styles.cardDetail}>
          {folder ? `Clones into ${folder}` : 'Start the Worker on this Mac to run chats.'}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={13}
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

/** The provider closest to its limit, so the root row shows what matters. */
function tightestMeter(meters: ProviderMeter[]) {
  let best: { meter: ProviderMeter; summary: string; left: number } | undefined;
  for (const meter of meters) {
    if (meter.status !== 'ok') continue;
    const used = meter.windows?.length
      ? Math.max(...meter.windows.map((window) => window.percentUsed))
      : meter.percentUsed;
    if (used !== undefined) {
      const left = Math.max(0, 100 - used);
      if (!best || left < best.left) best = { meter, summary: `${Math.floor(left)}% left`, left };
    } else if (!best && meter.remainingCents !== undefined) {
      best = { meter, summary: `${formatUsdCents(meter.remainingCents)} left`, left: 101 };
    } else if (!best && meter.totalTokens !== undefined) {
      best = { meter, summary: `${formatTokens(meter.totalTokens)} tokens`, left: 102 };
    }
  }
  return best;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-start' },
  cardTitle: { fontSize: 20, lineHeight: 25, fontWeight: 600 },
  cardDetail: { fontSize: 13, lineHeight: 18, alignSelf: 'stretch' },
});
