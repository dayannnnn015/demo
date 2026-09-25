import { spawnSync } from 'node:child_process';

/**
 * Runs tests/concurrency.pg.test.ts against a throwaway PostgreSQL container,
 * then removes it. The ordinary suite uses PGlite, which runs one transaction
 * at a time and so cannot show two writers interleaving; this is the one test
 * that needs a real server, which is why it is opt-in and needs Docker.
 * Nothing here touches a hosted database or reads .env.
 */
const name = 'edunexus-race-test';
const port = '55433';
const password = 'synthetic-local-only';
const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });

docker('rm', '-f', name);
const started = docker('run', '-d', '--rm', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '-p', `127.0.0.1:${port}:5432`, 'postgres:17-alpine');
if (started.status !== 0) {
  console.error('Could not start a PostgreSQL container. Is Docker running?\n' + started.stderr);
  process.exit(1);
}
let status = 1;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    ready = docker('exec', name, 'pg_isready', '-U', 'postgres').status === 0;
    if (!ready) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
  }
  if (!ready) throw new Error('PostgreSQL did not become ready.');
  // pg_isready answers before the entrypoint's own restart finishes, so wait for a real query too.
  for (let attempt = 0; attempt < 30; attempt++) {
    if (docker('exec', name, 'psql', '-U', 'postgres', '-tAc', 'select 1').stdout.trim() === '1') break;
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
  }
  const run = spawnSync('npx', ['vitest', 'run', 'tests/concurrency.pg.test.ts'], {
    stdio: 'inherit', shell: true,
    env: { ...process.env, EDUNEXUS_RACE_PG_URL: `postgres://postgres:${password}@127.0.0.1:${port}/postgres` },
  });
  status = run.status ?? 1;
} finally {
  docker('rm', '-f', name);
}
process.exit(status);
