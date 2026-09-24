import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ProviderMark } from '@/chats/model-picker';
import { ThemedText } from '@/components/themed-text';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/factory';
import { PROVIDER_SETUP } from '@/settings/providers';
import { VariableField } from '@/settings/setup-forms';
import { SettingsGroup, SettingsMessage, SettingsRow, SettingsScroll } from '@/settings/ui';
import { AGENT_PROVIDERS, providerLabel, type AgentProvider } from '../../../../../../shared/agentModel';

export default function ProviderPage() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ provider: string }>();
  const provider = AGENT_PROVIDERS.find((p) => p === params.provider) as AgentProvider | undefined;
  const live = useQuery(api.servers.local);
  const variables = useQuery(api.servers.variables, { scope: 'server' }) as Array<{ name: string }> | undefined;
  const setEnabled = useMutation(api.servers.setProviderEnabled);

  useLayoutEffect(() => {
    if (provider) navigation.setOptions({ title: providerLabel(provider) });
  }, [navigation, provider]);

  if (!provider) {
    return (
      <SettingsScroll>
        <SettingsGroup>
          <SettingsMessage>Unknown provider.</SettingsMessage>
        </SettingsGroup>
      </SettingsScroll>
    );
  }

  const setup = PROVIDER_SETUP[provider];
  const enabled = !live?.providersDisabled?.includes(provider);
  const entry = live?.providerModels?.find((row) => row.provider === provider);
  const saved = new Set((variables ?? []).map((row) => row.name));
  const status = !enabled
    ? 'Off'
    : !entry || !entry.enabled
      ? 'Checking…'
      : entry.authenticated
        ? 'Ready'
        : 'Not set up';

  return (
    <SettingsScroll>
      <View style={styles.hero}>
        <ProviderMark provider={provider} size={56} />
        <ThemedText style={styles.heroTitle}>{providerLabel(provider)}</ThemedText>
        <ThemedText themeColor={status === 'Ready' ? 'success' : 'textSecondary'} style={styles.heroStatus}>
          {status}
        </ThemedText>
      </View>

      <SettingsGroup footer={entry?.message}>
        <SettingsRow
          label="Use in chats"
          accessory={
            <Switch
              accessibilityLabel={`Use ${providerLabel(provider)} in chats`}
              value={enabled}
              disabled={!live}
              onValueChange={(value) => void setEnabled({ provider, enabled: value })}
            />
          }
        />
        {enabled && entry?.authenticated ? (
          <SettingsRow label="Models" value={String(entry.models.length)} />
        ) : null}
      </SettingsGroup>

      {enabled ? (
        <>
          <SettingsGroup title="Set up" footer="Keys are encrypted on this device and only the Worker can read them.">
            <View style={styles.signIn}>
              <ThemedText themeColor="textSecondary" style={styles.signInText}>
                {setup.signIn}
              </ThemedText>
            </View>
            {setup.fields.map((field) => (
              <VariableField
                key={field.name}
                {...field}
                saved={saved.has(field.name)}
                publicKey={live?.publicKey}
              />
            ))}
          </SettingsGroup>

          {entry?.authenticated && entry.models.length > 0 ? (
            <SettingsGroup title="Available models">
              {entry.models.map((model) => (
                <SettingsRow key={model.id} label={model.name} value={model.name === model.id ? undefined : model.id} />
              ))}
            </SettingsGroup>
          ) : null}
        </>
      ) : null}
    </SettingsScroll>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingTop: 8 },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: 700, marginTop: 6 },
  heroStatus: { fontSize: 15, lineHeight: 20 },
  signIn: { paddingHorizontal: 16, paddingVertical: 12 },
  signInText: { fontSize: 14, lineHeight: 20 },
});
