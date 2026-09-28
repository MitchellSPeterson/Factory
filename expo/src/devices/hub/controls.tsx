import { BottomSheet, RNHostView } from '@expo/ui';
import { useState, type Context, type ReactNode } from 'react';
import { FlatList, Platform, ScrollView, View, VirtualizedList, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Card } from 'panelui-native/components/card';
import { Item } from 'panelui-native/components/item';
import { Switch } from 'panelui-native/components/switch';
import { Input } from 'panelui-native/components/input';
import { Text } from 'panelui-native/primitives/text';
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
  return <Text selectable muted={muted} className="text-[15px] leading-[21px]">{children}</Text>;
}
/** The app's one bottom sheet. `header` replaces the default title + close row (e.g. for back navigation). */
export function Sheet({ title, visible, onClose, children, scroll = true, header }: { title: string; visible: boolean; onClose: () => void; children: ReactNode; scroll?: boolean; header?: ReactNode }) {
  const t = useTheme();
  const keyboard = useKeyboardHeight();
  const { height } = useWindowDimensions();
  // Web: vaul's inner div sizes to content, so a 0-height flex body collapses. Match the 96vh drawer minus its handle.
  const webBody = Platform.OS === 'web' ? { height: height * 0.96 - 32, flexGrow: 0 } : null;
  return (
    // containerColor is a native host prop (BottomSheet from @expo/ui), not a style — it needs an actual
    // color value, so useTheme stays for this one prop rather than a className.
    <BottomSheet isPresented={visible} onDismiss={onClose} snapPoints={['half', 'full']} contentPadding={0} containerColor={t.background}>
      <RNHostView>
        <View style={[sheetBodyLayout, webBody, keyboard > 0 ? { paddingBottom: keyboard } : null] as StyleProp<ViewStyle>}>
          {header ?? (
            <View className="flex-row items-center justify-between border-b border-border p-4">
              <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">{title}</Text>
              <IconButton icon="close" accessibilityLabel={`Close ${title}`} onPress={onClose} />
            </View>
          )}
          <SheetScrollContextReset>
            {scroll
              ? <ScrollView style={sheetFillLayout} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>{children}</ScrollView>
              : <View style={sheetFillLayout}>{children}</View>}
          </SheetScrollContextReset>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-[22px] gap-2.5">
      <Text accessibilityRole="header" className="text-[13px] font-semibold text-muted-foreground">{title}</Text>
      <Card className="gap-3 p-3">{children}</Card>
    </View>
  );
}
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return <View className="min-h-9 flex-row items-center justify-between gap-3"><View className="flex-1"><Label>{label}</Label></View>{children}</View>;
}
export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Row label={label}><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} /></Row>;
}
export type Option = { value: string; label: string };
export function Choice({ label, value, options, onChange, disabled }: { label: string; value: string; options: readonly Option[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Item accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label ?? value}`} disabled={disabled} onPress={() => setOpen(true)} className="p-0">
      <Item.Content><Item.Title>{label}</Item.Title></Item.Content>
      <Item.Actions><Text className="shrink text-right text-muted-foreground">{(options.find(o => o.value === value)?.label ?? value) || 'Choose'}  ›</Text></Item.Actions>
    </Item>
    <Sheet visible={open} title={label} onClose={() => setOpen(false)} scroll={false}>
      <FlatList style={sheetFillLayout} nestedScrollEnabled keyboardShouldPersistTaps="handled" data={options} keyExtractor={o => o.value} renderItem={({ item }) => (
        <Item accessibilityRole="radio" accessibilityState={{ checked: item.value === value }} onPress={() => { onChange(item.value); setOpen(false); }} className="rounded-none border-b border-border">
          <Item.Content><Item.Title>{item.label}</Item.Title></Item.Content>
          <Item.Actions><Text>{item.value === value ? '✓' : ''}</Text></Item.Actions>
        </Item>
      )} />
    </Sheet>
  </>;
}
export function Field({ label, value, onChange, numeric = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; placeholder?: string }) {
  return <Input label={label} value={value} onChangeText={onChange} placeholder={placeholder} autoCapitalize="none" autoCorrect={false} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} />;
}
export function options(values: readonly string[]): Option[] { return values.map(value => ({ value, label: value.replaceAll('-', ' ') })); }
// Kept for the two call sites (DeviceList, Inspector) that still size a scrollable body against the
// sheet's native host view — sheetFillLayout comes from sheetLayout.ts (out of scope, vendor layout math).
export const styles = { sheetFill: sheetFillLayout };
