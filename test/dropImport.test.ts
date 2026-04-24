import { describe, expect, test } from 'bun:test';
import { parseDroppedPath } from '../src/input/DropImport.tsx';

describe('parseDroppedPath', () => {
  test('plain absolute path', () => {
    expect(parseDroppedPath('/Users/me/foo.png')).toBe('/Users/me/foo.png');
  });

  test('shell-escaped spaces', () => {
    expect(parseDroppedPath('/Users/me/foo\\ bar.png')).toBe(
      '/Users/me/foo bar.png',
    );
  });

  test('file:// URL with percent-encoded chars', () => {
    expect(parseDroppedPath('file:///Users/me/foo%20bar.png')).toBe(
      '/Users/me/foo bar.png',
    );
  });

  test('quoted path', () => {
    expect(parseDroppedPath('"/Users/me/foo.png"')).toBe('/Users/me/foo.png');
  });

  test('multi-file drop returns the first', () => {
    expect(parseDroppedPath('/a.png /b.png')).toBe('/a.png');
  });

  test('empty input', () => {
    expect(parseDroppedPath('   ')).toBeNull();
  });
});
