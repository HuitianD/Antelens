import { spawnSync } from 'node:child_process';

/** Invoke the package manager already running this script, without a shell or Windows .cmd shim. */
export function pnpmCommand(args: string[], cli = process.env.npm_execpath) {
  if (!cli || !/pnpm(?:\.c?js)?$/i.test(cli.replaceAll('\\', '/'))) {
    throw new Error('Run this command through the pinned pnpm package manager.');
  }
  return { command: process.execPath, args: [cli, ...args] };
}

/** Only stop the process trees created by this launcher. */
export function stopChildTree(pid: number) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-pid, 'SIGTERM'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
