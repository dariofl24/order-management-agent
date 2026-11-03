import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const root of ['src', 'tests', 'scripts']) {
  for (const entry of readdirSync(root, { recursive: true })) {
    if (!entry.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${root}/${entry}`], {
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
console.log('Sintaxis JavaScript correcta.');
