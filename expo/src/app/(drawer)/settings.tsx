import { useQuery } from 'convex/react';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { api } from '@/lib/api';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProjectScope } from '@/lib/project-scope-context';
import { providerLabel } from '../../../../convex/lib/agentModel';
import type { Doc } from '../../../../convex/_generated/dataModel';
import {
  formatCheckedAt,
  formatPercent,
  formatReset,
  formatTokens,
  formatUsdCents,
  usageFillColor,
} from '@/settings/format';

type ProviderMeter = NonNullable<Doc<'servers'>['providerUsage']>['meters'][number];

type SettingsTab = 'general' | 'project';

export default function SettingsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const live = useQuery(api.servers.local);
  const { scope, currentProject, label } = useProjectScope();
  const project = useQuery(
    api.projects.get,
    scope.kind === 'project' ? { projectId: scope.projectId } : 'skip',
  );
  const [tab, setTab] = useState<SettingsTab>('general');
  const [now, setNow] = useState(Date.now());

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const online = !!(live && now - live.lastSeen < 45_000);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View
        accessibilityRole="tablist"
        style={[styles.tabs, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}>
        <TabButton label="General" selected={tab === 'general'} onPress={() => setTab('general')} />
        <TabButton label="Project" selected={tab === 'project'} onPress={() => setTab('project')} />
      </View>

      {tab === 'general' ? (
        <>
          <View style={styles.block}>
            <View style={styles.sectionHeading}>
              <ThemedText type="section">This machine</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                This machine clones repositories and runs your chats.
              </ThemedText>
            </View>
            {live === undefined ? (
              <ThemedText type="small" themeColor="textSecondary">
                Checking this machine…
              </ThemedText>
            ) : live ? (
              <View style={[styles.option, { borderColor: theme.line }]}>
                <ThemedText type="smallBold">
                  {live.name} · {online ? 'Online' : 'Offline'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Repositories: {live.projectsRoot}
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Start the worker on this machine. It registers itself with this Factory.
              </ThemedText>
            )}
          </View>

          <View style={styles.block}>
            <View style={styles.sectionHeading}>
              <ThemedText type="section">Usage</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Live limits from providers already signed in on this machine.
              </ThemedText>
            </View>
            {!live ? (
              <ThemedText type="small" themeColor="textSecondary">
                Start the worker to read remaining usage from each provider.
              </ThemedText>
            ) : !live.providerUsage ? (
              <ThemedText type="small" themeColor="textSecondary">
                Waiting for the first usage check…
              </ThemedText>
            ) : live.providerUsage.meters.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Sign in with Codex or Grok on this machine. Factory reads those logins on its own.
              </ThemedText>
            ) : (
              <>
                {live.providerUsage.meters.map((meter) => (
                  <UsageMeter key={meter.provider} meter={meter} now={now} />
                ))}
                <ThemedText type="small" themeColor="textSecondary">
                  {formatCheckedAt(live.providerUsage.checkedAt, now)}
                </ThemedText>
              </>
            )}
          </View>
        </>
      ) : (
        <View style={styles.block}>
          <View style={styles.sectionHeading}>
            <ThemedText type="section">Project</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {scope.kind === 'project'
                ? 'Settings and Factory-recorded usage for the Project selected in the drawer.'
                : 'Choose a Project in the drawer to see its settings.'}
            </ThemedText>
          </View>
          {scope.kind === 'project' && project === undefined && currentProject ? (
            <ThemedText type="small" themeColor="textSecondary">
              Loading Project settings…
            </ThemedText>
          ) : scope.kind === 'project' && project ? (
            <>
              <View style={[styles.option, { borderColor: theme.line }]}>
                <ThemedText type="smallBold">{project.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {kindLabel(project.kind)} · {project.githubRepo || project.localPath}
                </ThemedText>
                {project.cloneStatus ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Clone: {cloneLabel(project.cloneStatus)}
                    {project.cloneError ? ` · ${project.cloneError}` : ''}
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.sectionHeading}>
                <ThemedText type="smallBold">Usage in this Factory</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tokens recorded on Sessions for this Project. Remaining provider allowance is on
                  General — it belongs to the account, not this Project.
                </ThemedText>
              </View>
              <ProjectUsage usage={project.usage} />
            </>
          ) : (
            <View style={[styles.option, { borderColor: theme.line }]}>
              <ThemedText type="smallBold">{label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Chats currently include every Project.
              </ThemedText>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        {
          backgroundColor: selected ? theme.backgroundSelected : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function UsageMeter({
  meter,
  now,
}: {
  meter: ProviderMeter;
  now: number;
}) {
  const theme = useTheme();
  const title = providerLabel(meter.provider);
  if (meter.status !== 'ok') {
    return (
      <View style={[styles.meter, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor={meter.status === 'error' ? 'danger' : 'textSecondary'}>
          {meter.message}
        </ThemedText>
      </View>
    );
  }
  const windows = meter.windows ?? [];
  const remaining = meter.remainingCents;
  const limit = meter.limitCents;
  const used = meter.usedCents ?? (remaining !== undefined && limit !== undefined ? limit - remaining : undefined);
  const percent = meter.percentUsed ?? (used !== undefined && limit ? (used / limit) * 100 : undefined);
  return (
    <View style={[styles.meter, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.meterHead}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {meter.plan ? (
          <ThemedText type="small" themeColor="textSecondary">
            {meter.plan}
          </ThemedText>
        ) : null}
      </View>
      {windows.length > 0
        ? windows.map((window) => (
            <UsageBar
              key={window.name}
              label={window.name}
              percent={window.percentUsed}
              now={now}
              resetsAt={window.resetsAt}
              windowSeconds={window.windowSeconds}
            />
          ))
        : percent !== undefined
          ? (
              <UsageBar
                label={remaining !== undefined ? `${formatUsdCents(remaining)} left` : used !== undefined ? `${formatUsdCents(used)} used` : title}
                percent={percent}
                now={now}
                resetsAt={meter.resetsAt}
                detail={used !== undefined && limit !== undefined ? `${formatUsdCents(used)} of ${formatUsdCents(limit)}` : undefined}
              />
            )
          : remaining !== undefined
            ? (
                <ThemedText type="default" style={styles.tabular}>
                  {formatUsdCents(remaining)} left
                </ThemedText>
              )
            : used !== undefined
              ? (
                  <ThemedText type="default" style={styles.tabular}>
                    {formatUsdCents(used)} used
                  </ThemedText>
                )
              : null}
      {meter.display ? (
        <ThemedText type="small" themeColor="textSecondary">
          {meter.display}
        </ThemedText>
      ) : null}
    </View>
  );
}

function UsageBar({
  label,
  percent,
  now,
  resetsAt,
  windowSeconds,
  detail,
}: {
  label: string;
  percent: number;
  now: number;
  resetsAt?: number;
  windowSeconds?: number;
  detail?: string;
}) {
  const theme = useTheme();
  const fill = usageFillColor(percent, now, resetsAt, windowSeconds);
  const width = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.window}>
      <View style={styles.meterHead}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.tabular}>
          {formatPercent(percent)}
        </ThemedText>
      </View>
      <View
        accessible
        accessibilityLabel={`${label} ${formatPercent(percent)} used`}
        style={[styles.track, { backgroundColor: theme.line }]}>
        <View style={[styles.fill, { width: `${width}%`, backgroundColor: fill }]} />
      </View>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
          {detail}
        </ThemedText>
      ) : null}
      {resetsAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          {formatReset(resetsAt, now)}
        </ThemedText>
      ) : null}
    </View>
  );
}

function ProjectUsage({
  usage,
}: {
  usage:
    | {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        reasoningTokens: number;
        totalTokens: number;
      }
    | undefined;
}) {
  const theme = useTheme();
  if (!usage || usage.totalTokens === 0) {
    return (
      <View style={[styles.option, { borderColor: theme.line }]}>
        <ThemedText type="small" themeColor="textSecondary">
          No Sessions have recorded tokens on this Project yet.
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.option, { borderColor: theme.line }]}>
      <ThemedText type="default" style={styles.tabular}>
        {formatTokens(usage.totalTokens)} tokens
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
        {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out
        {usage.reasoningTokens ? ` · ${formatTokens(usage.reasoningTokens)} reasoning` : ''}
      </ThemedText>
    </View>
  );
}

function kindLabel(kind: string | undefined): string {
  if (kind === 'expo') return 'Expo';
  if (kind === 'web') return 'Web';
  if (kind === 'mixed') return 'Mixed';
  return 'Project';
}

function cloneLabel(status: string): string {
  if (status === 'ready') return 'Ready';
  if (status === 'queued') return 'Queued';
  if (status === 'cloning') return 'Cloning';
  if (status === 'failed') return 'Failed';
  return status;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 48,
    gap: Spacing.four,
    maxWidth: 720,
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 4,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    gap: 4,
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
  block: {
    gap: Spacing.three,
  },
  sectionHeading: {
    gap: 4,
  },
  option: {
    gap: 2,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  meter: {
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  meterHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  window: {
    gap: 6,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
