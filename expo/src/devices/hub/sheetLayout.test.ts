import { expect, test } from 'bun:test';
import { sheetBodyLayout, sheetFillLayout } from './sheetLayout';

test('sheet body takes the host height instead of the scroll child height', () => {
  expect(sheetBodyLayout).toEqual({ flexGrow: 1, height: 0 });
});

test('sheet fill can shrink so nested ScrollView and FlatList receive a bounded height', () => {
  expect(sheetFillLayout).toEqual({ flex: 1, minHeight: 0 });
});

test('Sheet scroll views opt into Android nested scrolling', async () => {
  const source = await Bun.file(new URL('./controls.tsx', import.meta.url)).text();
  expect(source).toContain('nestedScrollEnabled');
  expect(source).toContain('sheetBodyLayout');
  expect(source).toContain('sheetFillLayout');
});

test('Sheet shrinks by the visible keyboard inset so fields stay above the IME', async () => {
  const source = await Bun.file(new URL('./controls.tsx', import.meta.url)).text();
  expect(source).toContain('useKeyboardHeight');
  expect(source).toContain('paddingBottom: keyboard');
});

test('lists inside sheets fill the sheet and nest-scroll on Android', async () => {
  const inspector = await Bun.file(new URL('./Inspector.tsx', import.meta.url)).text();
  const devices = await Bun.file(new URL('./DeviceList.tsx', import.meta.url)).text();
  expect(inspector).toContain('nestedScrollEnabled');
  expect(inspector).toContain('styles.sheetFill');
  expect(devices).toContain('nestedScrollEnabled');
  expect(devices).toContain('styles.sheetFill');
});
