import { useRouter } from 'expo-router';
import { Switch } from 'react-native';

import { ProviderMark } from '@/chats/model-picker';
import { api } from '@/lib/api';
import type { ServerView } from '@/lib/dataModel';
import { useMutation, useQuery } from '@/lib/factory';
import { SettingsGroup, SettingsMessage, SettingsRow, SettingsScroll } from '@/settings/ui';
import { AGENT_PROVIDERS, providerLabel, type AgentProvider } from '../../../../../../shared/agentModel';

function providerStatus(server: ServerView, provider: AgentProvider) {
  if (server.providersDisabled?.includes(provider)) return 'Off';
  const entry = server.providerModels?.find((row) => row.provider === provider);
  if (!entry || !entry.enabled) return 'Checking…';
  if (entry.authenticated) return `${entry.models.length} models`;
  return 'Not set up';
}

export default function ProvidersPage() {
  const router = useRouter();
  const live = useQuery(api.servers.local);
  const setEnabled = useMutation(api.servers.setProviderEnabled);
  return (
    <SettingsScroll>
      <SettingsGroup footer="Chats only list models from providers that are on and set up. Tap a provider to sign in or add a key.">
        {!live ? (
          <SettingsMessage>{live === undefined ? 'Checking this Mac…' : 'Start the Worker to manage providers.'}</SettingsMessage>
        ) : (
          AGENT_PROVIDERS.map((provider) => (
            <SettingsRow
              key={provider}
              leading={<ProviderMark provider={provider} size={24} />}
              label={providerLabel(provider)}
              detail={providerStatus(live, provider)}
              onPress={() => router.push({ pathname: '/settings/providers/[provider]', params: { provider } })}
              accessory={
                <Switch
                  accessibilityLabel={`${providerLabel(provider)} on`}
                  value={!live.providersDisabled?.includes(provider)}
                  onValueChange={(value) => void setEnabled({ provider, enabled: value })}
                />
              }
            />
          ))
        )}
      </SettingsGroup>
    </SettingsScroll>
  );
}
