import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pnpmCommand } from './process-tools.js';

test('package-manager paths and arguments remain separate across platforms', () => {
  for (const cli of ['/Applications/Node Tools/pnpm.cjs', 'C:\\Program Files\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs']) {
    const invocation = pnpmCommand(['--filter', '@beforeyou/web', 'dev'], cli);
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, [cli, '--filter', '@beforeyou/web', 'dev']);
  }
  assert.throws(() => pnpmCommand([], '/usr/bin/npm'), /pinned pnpm/);
});
