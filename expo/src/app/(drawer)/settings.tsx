import { useQuery } from 'convex/react';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import { api } from '@/lib/api';
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
import { FactorySetup } from '@/settings/setup-forms';
import {
  AppearanceSwitcher,
  SettingsGroup,
  SettingsIcons,
  SettingsMessage,
  SettingsRow,
  StatusValue,
  UsageTrack,
} from '@/settings/ui';

type ProviderMeter = NonNullable<Doc<'servers'>['providerUsage']>['meters'][number];

export default function SettingsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const live = useQuery(api.servers.local);
  const { scope, currentProject, label } = useProjectScope();
  const project = useQuery(
    api.projects.get,
    scope.kind === 'project' ? { projectId: scope.projectId } : 'skip',
  );
  const [now, setNow] = useState(Date.now());

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const online = !!(live && now - live.lastSeen < 45_000);
  const usage = live?.providerUsage;
  const meters = usage?.meters ?? [];
  const wide = width >= 768;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.sidebar }]}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: wide ? 32 : 16, maxWidth: wide ? 600 : undefined },
      ]}
      contentInsetAdjustmentBehavior="automatic">
      <AppearanceSwitcher />

      <SettingsGroup
        title="This machine"
        footer="This machine clones repositories and runs your chats.">
        {live === undefined ? (
          <SettingsMessage>Checking this machine…</SettingsMessage>
        ) : live ? (
          <>
            <SettingsRow
              icon={SettingsIcons.machine}
              label={live.name}
              accessory={<StatusValue online={online} />}
            />
            <SettingsRow
              icon={SettingsIcons.folder}
              label="Repositories"
              value={live.projectsRoot}
              valueMode="middle"
            />
          </>
        ) : (
          <SettingsRow
            icon={SettingsIcons.machine}
            label="Worker"
            accessory={<StatusValue online={false} />}
            detail="Start the worker on this machine. It registers itself with this Factory."
          />
        )}
      </SettingsGroup>

      <FactorySetup publicKey={live?.publicKey} />

      {live === undefined ? (
        <SettingsGroup title="Usage">
          <SettingsMessage>Waiting for the first usage check…</SettingsMessage>
        </SettingsGroup>
      ) : !live ? (
        <SettingsGroup
          title="Usage"
          footer="Start the worker to read remaining usage from each provider.">
          <SettingsMessage>No live limits yet.</SettingsMessage>
        </SettingsGroup>
      ) : !usage ? (
        <SettingsGroup title="Usage">
          <SettingsMessage>Waiting for the first usage check…</SettingsMessage>
        </SettingsGroup>
      ) : meters.length === 0 ? (
        <SettingsGroup
          title="Usage"
          footer="Sign in with Codex or Grok on this machine. Factory reads those logins on its own.">
          <SettingsMessage>No providers signed in.</SettingsMessage>
        </SettingsGroup>
      ) : (
        meters.map((meter, index) => (
          <UsageMeter
            key={meter.provider}
            meter={meter}
            now={now}
            footer={index === meters.length - 1 ? formatCheckedAt(usage.checkedAt, now) : undefined}
          />
        ))
      )}

      {scope.kind === 'project' && project === undefined && currentProject ? (
        <SettingsGroup title="Project" footer="Settings for the Project selected in the drawer.">
          <SettingsMessage>Loading Project settings…</SettingsMessage>
        </SettingsGroup>
      ) : scope.kind === 'project' && project ? (
        <>
          <SettingsGroup
            title="Project"
            footer="Settings for the Project selected in the drawer.">
            <SettingsRow
              icon={SettingsIcons.project}
              label={project.name}
              value={kindLabel(project.kind)}
            />
            <SettingsRow
              icon={SettingsIcons.folder}
              label="Location"
              value={project.githubRepo || project.localPath}
              valueMode="middle"
            />
            {project.cloneStatus ? (
              <SettingsRow
                icon={SettingsIcons.clone}
                label="Clone"
                value={cloneLabel(project.cloneStatus)}
                valueTone={
                  project.cloneStatus === 'failed'
                    ? 'danger'
                    : project.cloneStatus === 'ready'
                      ? 'success'
                      : 'textSecondary'
                }
                detail={project.cloneStatus === 'failed' ? project.cloneError : undefined}
              />
            ) : null}
          </SettingsGroup>
          <ProjectUsage usage={project.usage} />
        </>
      ) : (
        <SettingsGroup
          title="Project"
          footer="Choose a Project in the drawer to see its settings.">
          <SettingsRow
            icon={SettingsIcons.project}
            label={label}
            detail="Chats currently include every Project."
          />
        </SettingsGroup>
      )}
    </ScrollView>
  );
}

function UsageMeter({
  meter,
  now,
  footer,
}: {
  meter: ProviderMeter;
  now: number;
  footer?: string;
}) {
  const title = providerLabel(meter.provider);
  if (meter.status !== 'ok') {
    return (
      <SettingsGroup title={title} footer={footer}>
        <SettingsRow
          icon={SettingsIcons.warning}
          label={meter.status === 'error' ? 'Could not read usage' : 'Not signed in'}
          valueTone={meter.status === 'error' ? 'danger' : 'textSecondary'}
          detail={meter.message}
        />
      </SettingsGroup>
    );
  }

  const windows = meter.windows ?? [];
  const remaining = meter.remainingCents;
  const limit = meter.limitCents;
  const used =
    meter.usedCents ??
    (remaining !== undefined && limit !== undefined ? limit - remaining : undefined);
  const percent =
    meter.percentUsed ?? (used !== undefined && limit ? (used / limit) * 100 : undefined);
  return (
    <SettingsGroup
      title={title}
      footer={[meter.display, footer].filter(Boolean).join(' · ') || undefined}>
      {meter.plan ? <SettingsRow icon={SettingsIcons.plan} label="Plan" value={meter.plan} /> : null}
      {windows.length > 0 ? (
        windows.map((window) => (
          <UsageWindow
            key={window.name}
            label={window.name}
            percent={window.percentUsed}
            now={now}
            resetsAt={window.resetsAt}
            windowSeconds={window.windowSeconds}
          />
        ))
      ) : percent !== undefined ? (
        <UsageWindow
          label={
            remaining !== undefined
              ? `${formatUsdCents(remaining)} left`
              : used !== undefined
                ? `${formatUsdCents(used)} used`
                : title
          }
          percent={percent}
          now={now}
          resetsAt={meter.resetsAt}
          detail={
            used !== undefined && limit !== undefined
              ? `${formatUsdCents(used)} of ${formatUsdCents(limit)}`
              : undefined
          }
        />
      ) : remaining !== undefined ? (
        <SettingsRow icon={SettingsIcons.chart} label="Remaining" value={formatUsdCents(remaining)} />
      ) : used !== undefined ? (
        <SettingsRow icon={SettingsIcons.chart} label="Used" value={formatUsdCents(used)} />
      ) : (
        <SettingsMessage>No usage figures yet.</SettingsMessage>
      )}
    </SettingsGroup>
  );
}

function UsageWindow({
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
  const fill = usageFillColor(percent, now, resetsAt, windowSeconds);
  const reset = resetsAt ? formatReset(resetsAt, now) : undefined;
  return (
    <SettingsRow
      icon={SettingsIcons.chart}
      label={label}
      value={formatPercent(percent)}
      detail={[detail, reset].filter(Boolean).join(' · ') || undefined}>
      <UsageTrack label={label} percent={percent} fill={fill} />
    </SettingsRow>
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
  const footer =
    'Tokens recorded on Sessions for this Project. Remaining provider allowance belongs to the account on this machine, not this Project.';
  if (!usage || usage.totalTokens === 0) {
    return (
      <SettingsGroup title="Usage in this Factory" footer={footer}>
        <SettingsMessage>No Sessions have recorded tokens on this Project yet.</SettingsMessage>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup title="Usage in this Factory" footer={footer}>
      <SettingsRow
        icon={SettingsIcons.tokens}
        label="Total"
        value={`${formatTokens(usage.totalTokens)} tokens`}
      />
      <SettingsRow icon={SettingsIcons.tokens} label="Input" value={formatTokens(usage.inputTokens)} />
      <SettingsRow icon={SettingsIcons.tokens} label="Output" value={formatTokens(usage.outputTokens)} />
      {usage.reasoningTokens ? (
        <SettingsRow
          icon={SettingsIcons.tokens}
          label="Reasoning"
          value={formatTokens(usage.reasoningTokens)}
        />
      ) : null}
    </SettingsGroup>
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
    width: '100%',
    alignSelf: 'center',
    paddingTop: 16,
    paddingBottom: 48,
    gap: 28,
  },
});
