import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useTheme } from '@/hooks/use-theme';

export const IconNames = {
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  devices: { ios: 'iphone', android: 'smartphone', web: 'smartphone' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  screenshot: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
  appearance: { ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' },
  reload: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  rotate: { ios: 'rotate.right', android: 'screen_rotation', web: 'screen_rotation' },
  expand: { ios: 'arrow.up.left.and.arrow.down.right', android: 'fullscreen', web: 'fullscreen' },
  collapse: { ios: 'arrow.down.right.and.arrow.up.left', android: 'fullscreen_exit', web: 'fullscreen_exit' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  recents: { ios: 'square.on.square', android: 'filter_none', web: 'filter_none' },
  menu: { ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  compose: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
  git: { ios: 'arrow.triangle.branch', android: 'account_tree', web: 'account_tree' },
  terminal: { ios: 'terminal', android: 'terminal', web: 'terminal' },
  jobs: { ios: 'list.bullet.rectangle', android: 'view_list', web: 'view_list' },
  sessions: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  layers: { ios: 'square.stack.3d.up.fill', android: 'layers', web: 'layers' },
} as const;

export type IconName = keyof typeof IconNames;

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'plain' | 'filled';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled,
  variant = 'plain',
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const filled = variant === 'filled';
  const color = filled ? theme.sidebar : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled
          ? { backgroundColor: theme.text }
          : { backgroundColor: theme.subtleHover },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <SymbolView name={IconNames[icon]} size={20} tintColor={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
