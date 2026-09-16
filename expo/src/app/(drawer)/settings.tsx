import { useQuery } from 'convex/react';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { api } from '@/lib/api';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const live = useQuery(api.servers.local);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);
  const [now, setNow] = useState(Date.now());

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
      <View style={styles.block}>
        <View style={styles.sectionHeading}>
          <ThemedText type="section">This machine</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            This machine clones repositories and runs your Jobs.
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
    </ScrollView>
  );
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
});
