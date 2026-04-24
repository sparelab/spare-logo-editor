import { appendFileSync } from 'node:fs';

/**
 * Tiny file logger. Goes to /tmp/spare-logo-editor.log so we can `tail -f`
 * during a session — stdout is owned by ink, so console.log is invisible.
 *
 * `tail -F /tmp/spare-logo-editor.log`
 *
 * Hardcoded to /tmp because os.tmpdir() resolves to /var/folders/... on
 * macOS, which makes the log harder to find than promised.
 */
export const LOG_FILE = '/tmp/spare-logo-editor.log';

export function log(...parts: unknown[]): void {
  try {
    const line =
      `[${new Date().toISOString()}] ` +
      parts
        .map((p) =>
          typeof p === 'string'
            ? p
            : (() => {
                try {
                  return JSON.stringify(p);
                } catch {
                  return String(p);
                }
              })(),
        )
        .join(' ') +
      '\n';
    appendFileSync(LOG_FILE, line);
  } catch {
    // best-effort — never throw from a logger
  }
}
