import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Badge } from 'panelui-native/components/badge';
import { Card } from 'panelui-native/components/card';
import { Progress } from 'panelui-native/components/progress';
import { Text } from 'panelui-native/primitives/text';

import { ProviderMark } from '@/chats/model-picker';
import { api } from '@/lib/api';
import type { ProviderMeter } from '@/lib/dataModel';
import { useQuery } from '@/lib/factory';
import {
  formatCheckedAt,
  formatReset,
  formatTokens,
  formatUsdCents,
  paceLabel,
  USAGE_FILL,
  usageFillColor,
} from '@/settings/format';
import { SettingsMessage, SettingsScroll } from '@/settings/ui';
import { providerLabel } from '../../../../../shared/agentModel';

type MeterColor = 'primary' | 'success' | 'warning' | 'destructive' | 'info';

export default function UsagePage() {
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
          <View key={meter.provider} className="gap-2.5">
            <View className="flex-row items-center gap-2.5 px-1">
              <ProviderMark provider={meter.provider} size={22} />
              <Text className="text-xl font-semibold leading-7">{providerLabel(meter.provider)}</Text>
              {meter.status === 'ok' && meter.plan ? <Badge variant="secondary">{meter.plan}</Badge> : null}
            </View>
            <MeterCards meter={meter} now={now} />
          </View>
        ))
      )}
      {usage ? (
        <Text size="sm" muted className="px-1">
          {formatCheckedAt(usage.checkedAt, now)}
        </Text>
      ) : null}
    </SettingsScroll>
  );
}

function MeterCards({ meter, now }: { meter: ProviderMeter; now: number }) {
  if (meter.status !== 'ok') {
    return (
      <Card>
        <Card.Header className="gap-1.5 p-4">
          <Card.Title className="text-base leading-6">
            {meter.status === 'error' ? 'Could not read usage' : 'Not signed in'}
          </Card.Title>
          <Card.Description>{meter.message}</Card.Description>
        </Card.Header>
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
          <Text size="sm" muted className="px-1">
            {`${formatUsdCents(meter.remainingCents)} of ${formatUsdCents(meter.limitCents)} included left`}
          </Text>
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
      <Card.Header className="gap-1.5 p-4">
        <Card.Title className="text-base leading-6">
          {meter.totalTokens !== undefined ? 'Local activity' : 'Usage'}
        </Card.Title>
        <Text className="text-[34px] font-bold leading-10 tabular-nums text-foreground">
          {figure ?? 'No usage figures yet'}
        </Text>
      </Card.Header>
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
  const left = Math.max(0, Math.min(100, 100 - percentUsed));
  const pace = paceLabel(percentUsed, now, resetsAt, windowSeconds);
  const meta = [resetsAt ? formatReset(resetsAt, now) : undefined, detail].filter(Boolean).join(' · ');
  return (
    <Card>
      <Card.Header className="gap-1.5 p-4">
        <View className="flex-row items-baseline justify-between gap-3">
          <Card.Title className="text-base leading-6">{title}</Card.Title>
          {pace ? (
            <Text size="sm" muted>
              {pace}
            </Text>
          ) : null}
        </View>
        <Text className="text-[34px] font-bold leading-10 tabular-nums text-foreground">
          {/* Round down so any use shows below 100%. */}
          {Math.floor(left)}%
          <Text className="text-base font-normal text-muted-foreground"> left</Text>
        </Text>
        {meta ? (
          <Text size="sm" muted>
            {meta}
          </Text>
        ) : null}
        <Progress
          className="mt-2"
          size="lg"
          value={left}
          color={meterColor(percentUsed, now, resetsAt, windowSeconds)}
          accessibilityLabel={`${title} ${Math.floor(left)} percent left`}
        />
      </Card.Header>
    </Card>
  );
}

/** Same pace bands as the old fill, mapped onto Progress colors instead of hex. */
function meterColor(
  percentUsed: number,
  now: number,
  resetsAt?: number,
  windowSeconds?: number,
): MeterColor {
  const fill = usageFillColor(percentUsed, now, resetsAt, windowSeconds);
  if (fill === USAGE_FILL.comfortable) return 'success';
  if (fill === USAGE_FILL.onTrack) return 'info';
  if (fill === USAGE_FILL.approaching || fill === USAGE_FILL.overPace) return 'warning';
  return 'destructive';
}
