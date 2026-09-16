import { useQuery } from 'convex/react';
import { useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { inProjectScope } from '@/lib/project-scope';
import { useProjectScope } from '@/lib/project-scope-context';
import { LANES, laneOf } from '../../../../convex/lib/jobState';

export default function JobsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const jobs = useQuery(api.jobs.list);
  const { scope, label } = useProjectScope();

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Jobs' });
  }, [navigation]);

  const scoped = useMemo(
    () => (jobs ?? []).filter((row) => inProjectScope(row.job.projectId, scope)),
    [jobs, scope],
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.heading}>
        <ThemedText type="eyebrow" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="section">Jobs</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {scope.kind === 'project'
            ? 'Jobs in the selected Project.'
            : 'Jobs across every Project.'}
        </ThemedText>
      </View>
      {jobs === undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading Jobs…
        </ThemedText>
      ) : scoped.length === 0 ? (
        <EmptyState
          title={scope.kind === 'project' ? 'No Jobs in this Project' : 'No Jobs yet'}
          body={
            scope.kind === 'project'
              ? 'Start a Job against this Project from Factory on this machine.'
              : 'Choose a Project in the drawer, then start a Job.'
          }
        />
      ) : (
        <View style={styles.list}>
          {scoped.map((row) => (
            <View key={row.job._id} style={[styles.row, { borderColor: theme.line }]}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {row.job.request}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {laneTitle(row.job.status)}
                {scope.kind === 'viewAll' ? ` · ${row.projectName}` : ''}
                {` · ${row.recipeName}`}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function laneTitle(status: string): string {
  const lane = laneOf(status);
  if (lane === 'failed') return 'Failed';
  const named = LANES.find((item) => item.id === lane);
  return named?.title ?? 'Queued';
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
  heading: {
    gap: 4,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});
