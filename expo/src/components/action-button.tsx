import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from 'panelui-native/components/button';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({ label, onPress, variant = 'primary', disabled, style }: ActionButtonProps) {
  return (
    <Button
      variant={variant === 'ghost' ? 'outline' : 'primary'}
      disabled={disabled}
      onPress={onPress}
      className="self-start rounded-full"
      style={style}>
      {label}
    </Button>
  );
}
