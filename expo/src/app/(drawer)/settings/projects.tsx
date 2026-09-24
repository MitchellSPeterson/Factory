import { StyleSheet, View } from 'react-native';

import { ProjectPicture } from '@/components/project-picture';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/factory';
import { useProjectScope } from '@/lib/project-scope-context';
import { AddProjectFlow, useOpenAddedProject } from '@/settings/add-project';
import { formatTokens } from '@/settings/format';
import { GitHubGroup } from '@/settings/setup-forms';
import { SettingsGroup, SettingsIcons, SettingsMessage, SettingsRow, SettingsScroll } from '@/settings/ui';

export default function ProjectsPage() {
  const { scope, currentProject } = useProjectScope();
  const project = useQuery(api.projects.get, scope.kind === 'project' ? { projectId: scope.projectId } : 'skip');
  const github = useQuery(api.github.connection);
  const disconnectGithub = useMutation(api.github.disconnect);
  const openAdded = useOpenAddedProject();
  return (
    <SettingsScroll>
      {scope.kind === 'project' && project === undefined && currentProject ? (
        <SettingsGroup title="Current Project">
          <SettingsMessage>Loading Project…</SettingsMessage>
        </SettingsGroup>
      ) : scope.kind === 'project' && project ? (
        <>
          <SettingsGroup title="Current Project" footer="The Project selected in the drawer.">
            <SettingsRow
              leading={<ProjectPicture githubRepo={project.githubRepo} name={project.name} />}
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
        <SettingsGroup title="Current Project" footer="Choose a Project in the drawer to see its details.">
          <SettingsRow icon={SettingsIcons.project} label="All Projects" detail="Chats currently include every Project." />
        </SettingsGroup>
      )}

      <SettingsGroup title="Add a Project" footer="Use a folder on this Mac, or clone from GitHub into the clone folder.">
        <View style={styles.pad}>
          <AddProjectFlow onAdded={openAdded} />
        </View>
      </SettingsGroup>

      <GitHubGroup github={github} disconnectGithub={disconnectGithub} />
    </SettingsScroll>
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
      <SettingsGroup title="Usage in this Project" footer={footer}>
        <SettingsMessage>No Sessions have recorded tokens on this Project yet.</SettingsMessage>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup title="Usage in this Project" footer={footer}>
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
  pad: { padding: 12, gap: 10 },
});
