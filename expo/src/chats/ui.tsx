import type { ComponentType } from 'react';
import { Alert } from 'panelui-native/components/alert';
import { Button } from 'panelui-native/components/button';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CodeIcon,
  CopyIcon,
  PaperclipIcon,
  PauseIcon,
  PlusIcon,
  RotateCwIcon,
  SendArrowIcon,
  ShareNodesIcon,
  XIcon,
} from 'panelui-native/icons';

const icons = {
  add: PlusIcon,
  send: SendArrowIcon,
  terminal: CodeIcon,
  git: ShareNodesIcon,
  back: ChevronLeftIcon,
  close: XIcon,
  check: CheckIcon,
  refresh: RotateCwIcon,
  attach: PaperclipIcon,
  stop: PauseIcon,
  down: ChevronDownIcon,
  copy: CopyIcon,
} as const;

type IconKey = keyof typeof icons;

export function Action({
  icon,
  label,
  onPress,
  disabled,
  selected,
  compact,
  emphasis,
}: {
  icon?: IconKey;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
  emphasis?: boolean;
}) {
  const Glyph = icon ? (icons[icon] as ComponentType<{ size?: number }>) : null;
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      size={compact ? 'icon' : 'sm'}
      variant={emphasis ? 'primary' : selected ? 'secondary' : 'ghost'}>
      {Glyph ? <Glyph size={16} /> : null}
      {compact ? null : label}
    </Button>
  );
}

export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <Alert variant={error ? 'destructive' : 'default'} className="mx-3">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description selectable>{text}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
