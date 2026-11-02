import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'

Tests.test('failed cache-mutation acquisition releases lease ownership and retains its probe for later cleanup', async () => {
  await withFailureFixture(async root => {
    const script = S`
      let failMutation = false;
      const acquire = locks.acquire;
      mock.module(${JSON.stringify(lockUrl)}, () => ({ ...locks, async acquire(path) {
        if (failMutation && path.endsWith('cache-mutation.lock')) throw new Error('mutation unavailable');
        return acquire(path);
      } }));
      const storage = await import(${JSON.stringify(storageUrl)});
      const release = await storage.acquireCacheLease('fixture');
      failMutation = true;
      const failure = await Try(release, { catch: error => error.message });
      failMutation = false;
      const leaseDirectory = storage.resolveSupportDirectory('leases');
      const files = await fs.readdir(leaseDirectory);
      const probe = await acquire(${JSON.stringify(root)} + '/support/leases/' + files[0]);
      const released = probe !== undefined;
      probe?.release();
      const cleaned = await storage.cleanSharedCache();
      process.stdout.write(JSON.stringify({ failure, released, probes: files.length, cleaned }));
    `
    const result = JSON.parse(await runFailureScript(root, script)) as Record<string, unknown>
    Tests.expect(result).toEqual({ failure: 'Something went wrong.', released: true, probes: 1, cleaned: true })
  })
})

Tests.test('blocked lease probes protect the cache without preventing acquisition of an unrelated lease', async () => {
  for (
    const [stage, failure] of [['delete', 'EPERM'], ['delete', 'EBUSY'], ['open', 'EACCES'], ['open', 'EBUSY'], [
      'directory',
      'EACCES',
    ]]
  ) {
    await withFailureFixture(async root => {
      const script = S`
        let blocked = true;
        ${blockedProbeAdapters(stage!, failure!)}
        const storage = await import(${JSON.stringify(storageUrl)});
        await fs.mkdir(storage.resolveSupportDirectory('leases'), { recursive: true });
        await fs.writeFile(storage.resolveSupportDirectory('leases', 'blocked.lock'), '');
        await fs.mkdir(storage.resolveCacheDirectory(), { recursive: true });
        await fs.writeFile(storage.resolveCacheDirectory('keep'), 'cached data');
        const release = await storage.acquireCacheLease('unrelated');
        await release();
        const reasons = [];
        const protectedCache = !(await storage.cleanSharedCache(reason => reasons.push(reason)));
        const named = reasons.some(reason => reason.includes('leases') && reason.includes(${JSON.stringify(failure)}));
        const retained = await fs.readFile(storage.resolveCacheDirectory('keep'), 'utf8');
        blocked = false;
        const reclaimed = await storage.cleanSharedCache();
        process.stdout.write(JSON.stringify({ protectedCache, retained, reclaimed, named }));
      `
      Tests.expect(JSON.parse(await runFailureScript(root, script)))
        .toEqual({ protectedCache: true, retained: 'cached data', reclaimed: true, named: true })
    })
  }
})

function blockedProbeAdapters(stage: string, failure: string): string {
  return S`
        const remove = fs.rm;
        const readDirectory = fs.readdir;
        const acquire = locks.acquire;
        mock.module(${JSON.stringify(lockUrl)}, () => ({ ...locks, async acquire(path) {
          if (blocked && ${
    JSON.stringify(stage)
  } === 'open' && path.endsWith('blocked.lock')) throw Object.assign(new Error('blocked probe'), { code: ${
    JSON.stringify(failure)
  } });
          return acquire(path);
        } }));
        mock.module('node:fs/promises', () => ({ ...fs,
          async readdir(path, ...args) {
            if (blocked && ${
    JSON.stringify(stage)
  } === 'directory' && path.endsWith('leases')) throw Object.assign(new Error('blocked directory'), { code: ${
    JSON.stringify(failure)
  } });
            return readDirectory(path, ...args);
          }, async rm(path, options) {
          if (blocked && ${
    JSON.stringify(stage)
  } === 'delete' && path.endsWith('blocked.lock')) throw Object.assign(new Error('blocked probe'), { code: ${
    JSON.stringify(failure)
  } });
          return remove(path, options);
        } }));
  `
}

async function withFailureFixture(operation: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `lease-failure-${Platform.randomUUID()}`)
  await Try(() => operation(root), { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
}

async function runFailureScript(root: string, body: string): Promise<string> {
  const script = S`
    import { mock } from 'bun:test';
    import { Try } from ${JSON.stringify(new WebHost.URL('../../universal/universal.ts', import.meta.url).href)};
    const fs = await import('node:fs/promises');
    const locks = await import(${JSON.stringify(lockUrl)});
    ${body}
  `
  const environment = {
    TAO_CACHE_DIR: Path.join(root, 'cache'),
    TAO_SUPPORT_DIR: Path.join(root, 'support'),
  }
  const child = Platform.spawnPiped('bun', {
    variadicArgs: ['-e', script],
    addEnv: environment,
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  return stdout
}

const lockUrl = new WebHost.URL('../SessionLock.ts', import.meta.url).href
const storageUrl = new WebHost.URL('../Storage.ts', import.meta.url).href
