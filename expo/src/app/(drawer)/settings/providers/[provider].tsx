import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import { Switch } from 'panelui-native/components/switch';
import { Text } from 'panelui-native/primitives/text';

import { ProviderMark } from '@/chats/model-picker';
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
      <View className="items-center gap-1.5 pt-2">
        <ProviderMark provider={provider} size={56} />
        <Text className="mt-1.5 text-2xl font-bold leading-8 text-foreground">{providerLabel(provider)}</Text>
        <Text className={status === 'Ready' ? 'text-[15px] leading-5 text-success' : 'text-[15px] leading-5 text-muted-foreground'}>
          {status}
        </Text>
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
            <Text className="px-4 py-3 text-sm leading-5 text-muted-foreground">{setup.signIn}</Text>
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
