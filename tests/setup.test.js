import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('el proyecto se puede cargar como ESM en Node 22+', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22);
  assert.equal(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).type,
    'module',
  );
});
