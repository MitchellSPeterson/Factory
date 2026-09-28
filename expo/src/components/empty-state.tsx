import { type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { EmptyState as PanelEmpty } from 'panelui-native/components/empty-state';

import { IconNames, type IconName } from '@/components/icon-button';

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <PanelEmpty className="max-w-[440px] flex-1 self-center px-6 py-8">
      {icon ? (
        <PanelEmpty.Media variant="icon">
          <SymbolView name={IconNames[icon]} size={28} />
        </PanelEmpty.Media>
      ) : null}
      <PanelEmpty.Title className="text-center">{title}</PanelEmpty.Title>
      <PanelEmpty.Description className="text-center">{body}</PanelEmpty.Description>
      {action ? <PanelEmpty.Content>{action}</PanelEmpty.Content> : null}
    </PanelEmpty>
  );
}
