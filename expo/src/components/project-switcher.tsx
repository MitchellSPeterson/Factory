import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePathname } from 'expo-router';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconNames } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProjectScope } from '@/lib/project-scope-context';
import type { ProjectScope } from '@/lib/project-scope';

const MENU_MS = 180;
const MENU_EASE = Easing.bezier(0.23, 1, 0.32, 1);

function menuEntering() {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 0.95 }],
    },
    animations: {
      opacity: withTiming(1, { duration: MENU_MS, easing: MENU_EASE }),
      transform: [{ scale: withTiming(1, { duration: MENU_MS, easing: MENU_EASE }) }],
    },
  };
}

export function ProjectSwitcher() {
  const theme = useTheme();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const { scope, setScope, projects, currentProject, label } = useProjectScope();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, w: 0 });
  const triggerRef = useRef<View>(null);
  const dark = theme.background === Colors.dark.background;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function choose(next: ProjectScope) {
    setScope(next);
    setOpen(false);
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPos({ x, y: y + h, w });
      setOpen(true);
    });
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.eyebrow}>
        Working on
      </ThemedText>
      <View
        collapsable={false}
        style={styles.stretch}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Pressable
          ref={triggerRef}
          accessibilityRole="button"
          accessibilityLabel={`Project scope, ${label}`}
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={({ pressed }) => [
            styles.trigger,
            width > 0 ? { width } : styles.stretch,
            {
              backgroundColor: open || pressed ? theme.subtleHover : theme.background,
              borderColor: theme.line,
              transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
            },
          ]}>
          {currentProject?.name[0] ? (
            <View style={[styles.glyph, { backgroundColor: theme.subtleHover }]}>
              <ThemedText type="smallBold" style={styles.glyphLetter}>
                {currentProject.name[0].toUpperCase()}
              </ThemedText>
            </View>
          ) : (
            <SymbolView name={IconNames.layers} size={16} tintColor={theme.textSecondary} />
          )}
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            {label}
          </ThemedText>
          <Chevron open={open} color={theme.textSecondary} />
        </Pressable>
        <Modal
          visible={open}
          transparent
          animationType="none"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss project menu"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <Animated.View
            entering={reduced ? undefined : menuEntering}
            style={[
              styles.menu,
              {
                top: menuPos.y + 4,
                left: menuPos.x,
                width: menuPos.w,
                maxHeight: Math.min(280, Math.max(120, windowHeight - menuPos.y - 16)),
                backgroundColor: dark ? '#2c2c2c' : '#ffffff',
                borderColor: theme.line,
              },
            ]}>
            <ScrollView
              accessibilityRole="menu"
              accessibilityLabel="Project scope"
              contentContainerStyle={styles.menuContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled">
              <ScopeOption
                label="View all"
                selected={scope.kind === 'viewAll'}
                onPress={() => choose({ kind: 'viewAll' })}
              />
              {(projects ?? []).map((project) => (
                <ScopeOption
                  key={project._id}
                  label={project.name}
                  selected={scope.kind === 'project' && scope.projectId === project._id}
                  onPress={() => choose({ kind: 'project', projectId: project._id })}
                />
              ))}
            </ScrollView>
          </Animated.View>
        </Modal>
      </View>
    </View>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  const rotation = useSharedValue(open ? 180 : 0);
  useLayoutEffect(() => {
    rotation.set(
      withTiming(open ? 180 : 0, {
        duration: MENU_MS,
        easing: MENU_EASE,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [open, rotation]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={style}>
      <SymbolView name={IconNames.chevronDown} size={12} tintColor={color} />
    </Animated.View>
  );
}

function ScopeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor:
            selected || pressed ? theme.backgroundSelected : 'transparent',
          transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
        },
      ]}>
      <ThemedText type="small" numberOfLines={1} style={styles.optionLabel}>
        {label}
      </ThemedText>
      {selected ? <SymbolView name={IconNames.check} size={14} tintColor={theme.accent} /> : null}
    </Pressable>
  );
}

const pressMotion = Platform.select({
  web: {
    cursor: 'pointer' as const,
    transitionProperty: 'transform',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    paddingHorizontal: 4,
  },
  eyebrow: {
    paddingHorizontal: 8,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  trigger: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
    ...pressMotion,
  },
  glyph: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLetter: {
    fontSize: 11,
    lineHeight: 14,
  },
  name: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    transformOrigin: 'top center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      web: { boxShadow: '0 12px 40px rgba(0,0,0,0.22)' },
      default: {},
    }),
  },
  menuContent: {
    padding: 6,
    gap: 2,
  },
  option: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: 'continuous',
    ...pressMotion,
  },
  optionLabel: {
    flex: 1,
  },
});
