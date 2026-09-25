import { useWindowDimensions } from 'react-native';

/** Web at desktop width: permanent sidebar, hover, keyboard shortcuts. */
export function useDesktop() {
  const { width } = useWindowDimensions();
  return process.env.EXPO_OS === 'web' && width >= 1000;
}
