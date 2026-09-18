import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePathname } from 'expo-router';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';

import { IconNames } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useProjectScope } from '@/lib/project-scope-context';
import type { ProjectScope } from '@/lib/project-scope';

const VIEW_ALL = 'viewAll';

export function ProjectSwitcher() {
  const theme = useTheme();
  const pathname = usePathname();
  const colorScheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const { scope, setScope, projects, currentProject, label } = useProjectScope();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, w: 0 });
  const triggerRef = useRef<View>(null);
  const nativeMenu = process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android';

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function choose(next: ProjectScope) {
    setScope(next);
    setOpen(false);
  }

  function chooseFromId(id: string) {
    if (id === VIEW_ALL) {
      choose({ kind: 'viewAll' });
      return;
    }
    const project = (projects ?? []).find((item) => item._id === id);
    if (project) choose({ kind: 'project', projectId: project._id });
  }

  const actions = useMemo<MenuAction[]>(
    () => [
      {
        id: VIEW_ALL,
        title: 'View all',
        state: menuState(scope.kind === 'viewAll'),
        image: IconNames.layers.ios,
      },
      ...(projects ?? []).map((project) => ({
        id: project._id,
        title: project.name,
        state: menuState(scope.kind === 'project' && scope.projectId === project._id),
      })),
    ],
    [projects, scope],
  );

  const trigger = (
    <View
      style={[
        styles.trigger,
        { backgroundColor: theme.background, borderColor: theme.line },
        width > 0 ? { width } : styles.stretch,
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
      <View style={{ transform: [{ rotate: open && !nativeMenu ? '180deg' : '0deg' }] }}>
        <SymbolView name={IconNames.chevronDown} size={12} tintColor={theme.textSecondary} />
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.eyebrow}>
        Working on
      </ThemedText>
      <View
        style={styles.stretch}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {nativeMenu ? (
          <MenuView
            title="Project"
            actions={actions}
            colorScheme={colorScheme}
            onPressAction={(event) => chooseFromId(event.nativeEvent.event)}
            style={width > 0 ? { width } : styles.stretch}>
            {trigger}
          </MenuView>
        ) : (
          <View style={styles.anchor}>
            <Pressable
              ref={triggerRef}
              accessibilityRole="button"
              accessibilityLabel={`Project scope, ${label}`}
              accessibilityState={{ expanded: open }}
              onPress={() => {
                if (open) {
                  setOpen(false);
                  return;
                }
                triggerRef.current?.measureInWindow((x, y, w, h) => {
                  setMenuPos({ x, y: y + h, w });
                  setOpen(true);
                });
              }}
              style={({ pressed }) => pressed && { opacity: 0.7 }}>
              {trigger}
            </Pressable>
            <Modal
              visible={open}
              transparent
              animationType="fade"
              onRequestClose={() => setOpen(false)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss project menu"
                style={StyleSheet.absoluteFill}
                onPress={() => setOpen(false)}
              />
              <ScrollView
                accessibilityRole="menu"
                accessibilityLabel="Project scope"
                style={[
                  styles.menu,
                  {
                    top: menuPos.y + 4,
                    left: menuPos.x,
                    width: menuPos.w,
                    backgroundColor: theme.background,
                    borderColor: theme.lineStrong,
                  },
                ]}
                contentContainerStyle={styles.menuContent}
                nestedScrollEnabled>
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
            </Modal>
          </View>
        )}
      </View>
    </View>
  );
}

function menuState(selected: boolean): MenuAction['state'] {
  return selected ? 'on' : 'off';
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
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && { backgroundColor: theme.backgroundSelected },
        pressed && { opacity: 0.7 },
      ]}>
      <ThemedText type="small" numberOfLines={1} style={styles.optionLabel}>
        {label}
      </ThemedText>
      {selected ? <SymbolView name={IconNames.check} size={14} tintColor={theme.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    paddingHorizontal: 4,
    zIndex: 20,
    overflow: 'visible',
  },
  eyebrow: {
    paddingHorizontal: 8,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  anchor: {
    zIndex: 21,
    overflow: 'visible',
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
    zIndex: 30,
    maxHeight: 240,
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: 'continuous',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.22)',
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
    borderRadius: 7,
    borderCurve: 'continuous',
  },
  optionLabel: {
    flex: 1,
  },
});
