import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useCSSVariable } from 'uniwind';
import { Card } from 'panelui-native/components/card';
import { Item } from 'panelui-native/components/item';
import { ChevronRightIcon } from 'panelui-native/icons';

import { ProjectPicture } from '@/components/project-picture';
import { useDesktop } from '@/hooks/use-desktop';
import { api } from '@/lib/api';
import type { ProviderMeter } from '@/lib/dataModel';
import { useConnection, useQuery } from '@/lib/factory';
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
  const desktop = useDesktop();
  const { pairing } = useConnection();

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

      {/* Desktop lists these sections in the left column already. */}
      {!desktop && (
        <>
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
            {process.env.EXPO_OS === 'web' ? (
              <SettingsRow
                icon={SettingsIcons.phone}
                label="Pair a Phone"
                onPress={() => router.push('/settings/pairing')}
              />
            ) : (
              <SettingsRow
                icon={SettingsIcons.machine}
                label="Connect to a Mac"
                value={pairing?.url}
                valueMode="middle"
                onPress={() => router.push('/settings/connection')}
              />
            )}
          </SettingsGroup>
        </>
      )}

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
  const foreground = useCSSVariable('--color-foreground') as string | undefined;
  return (
    <Card className="overflow-hidden">
      <Item
        onPress={onPress}
        accessibilityLabel={`${name ?? 'Worker'}, ${online ? 'online' : 'offline'}`}
        className="rounded-none bg-transparent">
        <Item.Media className="h-[52px] w-[52px] rounded-xl bg-surface">
          <SymbolView name={SettingsIcons.machine} size={28} tintColor={foreground} />
        </Item.Media>
        <Item.Content className="items-start">
          <Item.Title numberOfLines={1} className="text-xl font-semibold leading-6">
            {checking ? 'Checking this Mac…' : name ?? 'Worker not running'}
          </Item.Title>
          {name ? <StatusValue online={online} /> : null}
          <Item.Description numberOfLines={1} ellipsizeMode="middle">
            {folder ? `Clones into ${folder}` : 'Start the Worker on this Mac to run chats.'}
          </Item.Description>
        </Item.Content>
        <Item.Actions>
          <ChevronRightIcon size={16} />
        </Item.Actions>
      </Item>
    </Card>
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
