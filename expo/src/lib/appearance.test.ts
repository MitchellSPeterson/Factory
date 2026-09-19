import { expect, test } from 'bun:test';
import { parseAppearance, resolveScheme } from './appearance';

test('parseAppearance accepts known values and defaults to system', () => {
  expect(parseAppearance('light')).toBe('light');
  expect(parseAppearance('dark')).toBe('dark');
  expect(parseAppearance('system')).toBe('system');
  expect(parseAppearance('')).toBe('system');
  expect(parseAppearance('nope')).toBe('system');
});

test('resolveScheme honors an explicit preference over the system', () => {
  expect(resolveScheme('light', 'dark')).toBe('light');
  expect(resolveScheme('dark', 'light')).toBe('dark');
});

test('resolveScheme follows the system when preference is system', () => {
  expect(resolveScheme('system', 'light')).toBe('light');
  expect(resolveScheme('system', 'dark')).toBe('dark');
  expect(resolveScheme('system', null)).toBe('dark');
  expect(resolveScheme('system', undefined)).toBe('dark');
});
