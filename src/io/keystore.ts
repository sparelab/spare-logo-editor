import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DIR = join(homedir(), '.spare-logo-editor');
const KEY_FILE = join(DIR, 'key');

export function getKey(): string | null {
  try {
    if (!existsSync(KEY_FILE)) return null;
    const v = readFileSync(KEY_FILE, 'utf8').trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setKey(value: string): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(KEY_FILE, value.trim() + '\n', 'utf8');
  // The key is a secret — restrict file perms to user only.
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {}
}
