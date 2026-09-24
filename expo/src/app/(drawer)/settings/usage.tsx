import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProviderMark } from '@/chats/model-picker';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { ProviderMeter } from '@/lib/dataModel';
import { useQuery } from '@/lib/factory';
import {
  formatCheckedAt,
  formatReset,
  formatTokens,
  formatUsdCents,
  paceLabel,
  usageFillColor,
} from '@/settings/format';
import { SettingsMessage, SettingsScroll } from '@/settings/ui';
import { providerLabel } from '../../../../../shared/agentModel';

export default function UsagePage() {
  const theme = useTheme();
  const live = useQuery(api.servers.local);
  const [now, setNow] = useState(Date.now());
  const usage = live?.providerUsage;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <SettingsScroll>
      {!usage ? (
        <Card>
          <SettingsMessage>
            {live === null ? 'Start the worker to read usage from each provider.' : 'Waiting for the first usage check…'}
          </SettingsMessage>
        </Card>
      ) : usage.meters.length === 0 ? (
        <Card>
          <SettingsMessage>No providers signed in.</SettingsMessage>
        </Card>
      ) : (
        usage.meters.map((meter) => (
          <View key={meter.provider} style={styles.section}>
            <View style={styles.sectionHeader}>
              <ProviderMark provider={meter.provider} size={22} />
              <ThemedText style={styles.sectionTitle}>{providerLabel(meter.provider)}</ThemedText>
              {meter.status === 'ok' && meter.plan ? (
                <View style={[styles.plan, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText themeColor="textSecondary" style={styles.planText}>
                    {meter.plan}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <MeterCards meter={meter} now={now} />
          </View>
        ))
      )}
      {usage ? (
        <ThemedText themeColor="textSecondary" style={styles.footer}>
          {formatCheckedAt(usage.checkedAt, now)}
        </ThemedText>
      ) : null}
    </SettingsScroll>
  );
}

function MeterCards({ meter, now }: { meter: ProviderMeter; now: number }) {
  if (meter.status !== 'ok') {
    return (
      <Card>
        <ThemedText style={styles.cardTitle}>
          {meter.status === 'error' ? 'Could not read usage' : 'Not signed in'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.meta}>
          {meter.message}
        </ThemedText>
      </Card>
    );
  }
  if (meter.windows?.length) {
    return (
      <>
        {meter.windows.map((window) => (
          <LimitCard
            key={window.name}
            title={window.name}
            percentUsed={window.percentUsed}
            now={now}
            resetsAt={window.resetsAt}
            windowSeconds={window.windowSeconds}
          />
        ))}
        {meter.remainingCents !== undefined && meter.limitCents !== undefined ? (
          <ThemedText themeColor="textSecondary" style={[styles.meta, { paddingHorizontal: 4 }]}>
            {`${formatUsdCents(meter.remainingCents)} of ${formatUsdCents(meter.limitCents)} included left`}
          </ThemedText>
        ) : null}
      </>
    );
  }
  const remaining = meter.remainingCents;
  const limit = meter.limitCents;
  const used = meter.usedCents ?? (remaining !== undefined && limit !== undefined ? limit - remaining : undefined);
  const percent = meter.percentUsed ?? (used !== undefined && limit ? (used / limit) * 100 : undefined);
  if (percent !== undefined) {
    return (
      <LimitCard
        title={meter.display ?? 'Billing period'}
        percentUsed={percent}
        now={now}
        resetsAt={meter.resetsAt}
        detail={used !== undefined && limit !== undefined ? `${formatUsdCents(used)} of ${formatUsdCents(limit)}` : undefined}
      />
    );
  }
  const figure =
    remaining !== undefined
      ? `${formatUsdCents(remaining)} left`
      : used !== undefined
        ? `${formatUsdCents(used)} used`
        : meter.totalTokens !== undefined
          ? `${formatTokens(meter.totalTokens)} tokens`
          : undefined;
  return (
    <Card>
      <ThemedText style={styles.cardTitle}>{meter.totalTokens !== undefined ? 'Local activity' : 'Usage'}</ThemedText>
      <ThemedText style={styles.big}>{figure ?? 'No usage figures yet'}</ThemedText>
    </Card>
  );
}

function LimitCard({
  title,
  percentUsed,
  now,
  resetsAt,
  windowSeconds,
  detail,
}: {
  title: string;
  percentUsed: number;
  now: number;
  resetsAt?: number;
  windowSeconds?: number;
  detail?: string;
}) {
  const theme = useTheme();
  const left = Math.max(0, Math.min(100, 100 - percentUsed));
  const pace = paceLabel(percentUsed, now, resetsAt, windowSeconds);
  const meta = [resetsAt ? formatReset(resetsAt, now) : undefined, detail].filter(Boolean).join(' · ');
  return (
    <Card>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        {pace ? (
          <ThemedText themeColor="textSecondary" style={styles.meta}>
            {pace}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.big}>
        {/* Round down so any use shows below 100%. */}
        {Math.floor(left)}%
        <ThemedText themeColor="textSecondary" style={styles.bigSuffix}>
          {' '}left
        </ThemedText>
      </ThemedText>
      {meta ? (
        <ThemedText themeColor="textSecondary" style={styles.meta}>
          {meta}
        </ThemedText>
      ) : null}
      <View
        accessible
        accessibilityLabel={`${title} ${Math.floor(left)} percent left`}
        style={[styles.track, { backgroundColor: theme.line }]}>
        <View
          style={[
            styles.fill,
            { width: `${left}%`, backgroundColor: usageFillColor(percentUsed, now, resetsAt, windowSeconds) },
          ]}
        />
      </View>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: 600 },
  plan: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderCurve: 'continuous' },
  planText: { fontSize: 12, lineHeight: 16, fontWeight: 600 },
  card: { borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: 600 },
  big: { fontSize: 34, lineHeight: 40, fontWeight: 700, fontVariant: ['tabular-nums'] },
  bigSuffix: { fontSize: 16, fontWeight: 400 },
  meta: { fontSize: 13, lineHeight: 18 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 5 },
  footer: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
