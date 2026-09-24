import { BottomSheet, RNHostView } from '@expo/ui';
import { useState, type Context, type ReactNode } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, VirtualizedList, useWindowDimensions } from 'react-native';
import { IconButton } from '@/components/icon-button';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useTheme } from '@/hooks/use-theme';
import { sheetBodyLayout, sheetFillLayout } from './sheetLayout';

const VirtualizedListContext = (VirtualizedList as unknown as { contextType?: Context<unknown> }).contextType;
const ScrollViewContext = (ScrollView as unknown as { Context?: Context<unknown> }).Context;

function SheetScrollContextReset({ children }: { children: ReactNode }) {
  let node: ReactNode = children;
  if (ScrollViewContext) node = <ScrollViewContext.Provider value={null}>{node}</ScrollViewContext.Provider>;
  if (VirtualizedListContext) node = <VirtualizedListContext.Provider value={null}>{node}</VirtualizedListContext.Provider>;
  return node;
}

export function Label({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text selectable style={{ color: muted ? t.textSecondary : t.text, fontSize: 15, lineHeight: 21 }}>{children}</Text>;
}
/** The app's one bottom sheet. `header` replaces the default title + close row (e.g. for back navigation). */
export function Sheet({ title, visible, onClose, children, scroll = true, header }: { title: string; visible: boolean; onClose: () => void; children: ReactNode; scroll?: boolean; header?: ReactNode }) {
  const t = useTheme();
  const keyboard = useKeyboardHeight();
  const { height } = useWindowDimensions();
  // Web: vaul's inner div sizes to content, so a 0-height flex body collapses. Match the 96vh drawer minus its handle.
  const webBody = Platform.OS === 'web' ? { height: height * 0.96 - 32, flexGrow: 0 } : null;
  return (
    <BottomSheet isPresented={visible} onDismiss={onClose} snapPoints={['half', 'full']} contentPadding={0} containerColor={t.background}>
      <RNHostView>
        <View style={[styles.sheetBody, webBody, keyboard > 0 ? { paddingBottom: keyboard } : null]}>
          {header ?? (
            <View style={[styles.sheetHead, { borderColor: t.line }]}>
              <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '600', color: t.text }}>{title}</Text>
              <IconButton icon="close" accessibilityLabel={`Close ${title}`} onPress={onClose} />
            </View>
          )}
          <SheetScrollContextReset>
            {scroll
              ? <ScrollView style={styles.sheetFill} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.content}>{children}</ScrollView>
              : <View style={styles.sheetFill}>{children}</View>}
          </SheetScrollContextReset>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
export function Group({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return <View style={{ gap: 10, marginBottom: 22 }}><Text accessibilityRole="header" style={{ color: t.textSecondary, fontSize: 13, fontWeight: '600' }}>{title}</Text><View style={{ backgroundColor: t.backgroundElement, borderRadius: 12, borderCurve: 'continuous', padding: 12, gap: 12 }}>{children}</View></View>;
}
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.row}><View style={{ flex: 1 }}><Label>{label}</Label></View>{children}</View>;
}
export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Row label={label}><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} /></Row>;
}
export type Option = { value: string; label: string };
export function Choice({ label, value, options, onChange, disabled }: { label: string; value: string; options: readonly Option[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTheme();
  return <><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label ?? value}`} disabled={disabled} onPress={() => setOpen(true)} style={[styles.row, { minHeight: 44, opacity: disabled ? .5 : 1 }]}><Label>{label}</Label><Text style={{ color: t.textSecondary, flexShrink: 1, textAlign: 'right' }}>{(options.find(o => o.value === value)?.label ?? value) || 'Choose'}  ›</Text></Pressable>
    <Sheet visible={open} title={label} onClose={() => setOpen(false)} scroll={false}><FlatList style={styles.sheetFill} nestedScrollEnabled keyboardShouldPersistTaps="handled" data={options} keyExtractor={o => o.value} renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.value === value }} onPress={() => { onChange(item.value); setOpen(false); }} style={[styles.option, { borderColor: t.line }]}><Label>{item.label}</Label><Label>{item.value === value ? '✓' : ''}</Label></Pressable>} /></Sheet>
  </>;
}
export function Field({ label, value, onChange, numeric = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; placeholder?: string }) {
  const t = useTheme();
  return <View style={{ gap: 6 }}><Label muted>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.textSecondary} autoCapitalize="none" autoCorrect={false} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} style={{ minHeight: 44, borderWidth: 1, borderColor: t.lineStrong, borderRadius: 8, padding: 10, color: t.text, fontSize: 16 }} /></View>;
}
export function options(values: readonly string[]): Option[] { return values.map(value => ({ value, label: value.replaceAll('-', ' ') })); }
export const styles = StyleSheet.create({
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetBody: sheetBodyLayout,
  sheetFill: sheetFillLayout,
  content: { padding: 16, paddingBottom: 36 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 },
  option: { minHeight: 52, padding: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
