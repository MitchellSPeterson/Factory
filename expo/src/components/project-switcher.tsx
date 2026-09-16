import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePathname } from 'expo-router';

import { IconNames } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useProjectScope } from '@/lib/project-scope-context';
import type { ProjectScope } from '@/lib/project-scope';

export function ProjectSwitcher() {
  const theme = useTheme();
  const pathname = usePathname();
  const { scope, setScope, projects, currentProject, label } = useProjectScope();
  const [open, setOpen] = useState(false);
  const letter = currentProject?.name[0]?.toUpperCase();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function choose(next: ProjectScope) {
    setScope(next);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.eyebrow}>
        Working on
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Project scope, ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: theme.background, borderColor: theme.line },
          pressed && { opacity: 0.7 },
        ]}>
        {letter ? (
          <View style={[styles.glyph, { backgroundColor: theme.subtleHover }]}>
            <ThemedText type="smallBold" style={styles.glyphLetter}>
              {letter}
            </ThemedText>
          </View>
        ) : (
          <SymbolView name={IconNames.layers} size={16} tintColor={theme.textSecondary} />
        )}
        <ThemedText type="small" numberOfLines={1} style={styles.name}>
          {label}
        </ThemedText>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <SymbolView name={IconNames.chevronDown} size={12} tintColor={theme.textSecondary} />
        </View>
      </Pressable>
      {open ? (
        <ScrollView
          accessibilityRole="menu"
          accessibilityLabel="Project scope"
          style={[styles.menu, { backgroundColor: theme.background, borderColor: theme.lineStrong }]}
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
      ) : null}
    </View>
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
  },
  eyebrow: {
    paddingHorizontal: 8,
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
    maxHeight: 240,
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: 'continuous',
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
