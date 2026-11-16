import * as Tests from '@shared-tests'
import Exec from '@shared/os/exec'
import * as FS from '../../shared-src/os/FS'
import * as Path from '../../shared-src/os/Path'
import * as Platform from '../../shared-src/os/Platform'
import * as Repo from '../../shared-src/os/Repo'
import * as Artifacts from '../../shared-src/os/Storage/Artifacts'
import * as Bundle from '../../shared-src/os/Tooling/Bundle'
import { S, Try } from '../../shared-src/universal/universal'

Tests.test('generated namespace routes reads, absence and retained descriptors while outside files stay on disk', async () => {
  const directory = Artifacts.resolvePath('tmp/generated-filesystem', Platform.randomUUID())
  const root = Path.join(directory, 'src')
  await FS.mkdir(Path.join(root, '_gen_runtime'))
  await FS.writeFile(Path.join(root, 'disk-only.ts'), 'disk ghost')
  await FS.writeFile(Path.join(directory, 'outside.ts'), 'outside')
  await Bundle.bundleNode(Repo.resolvePath('ts/shared/shared-src/os/FS/GeneratedFileSystem.ts'), directory, [])
  await runRoutingFixture(directory, root)
})

const routingScript = S`
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const fsp = require('node:fs/promises');
  const path = require('node:path');
  const { installGeneratedFileSystem } = require(process.argv[1]);
  const root = process.argv[2];
  const owner = installGeneratedFileSystem(root, { 'App.tsx': 'A', 'helper.ts': 'old helper' });
  const app = path.join(root, 'App.tsx');
  assert.equal(fs.readFileSync(app, 'utf8'), 'A');
  assert.equal(await fsp.readFile(app, 'utf8'), 'A');
  assert.equal(fs.existsSync(path.join(root, 'disk-only.ts')), false);
  assert.throws(() => fs.readFileSync(path.join(root, 'disk-only.ts')), { code: 'ENOENT' });
  assert.equal(fs.readFileSync(path.join(root, '../outside.ts'), 'utf8'), 'outside');
  fs.writeFileSync(path.join(root, '../outside.ts'), app);
  assert.equal(fs.readFileSync(path.join(root, '../outside.ts'), 'utf8'), app);
  assert.equal(fs.realpathSync(path.join(root, '_gen_runtime')), path.join(root, '_gen_runtime'));
  const descriptor = fs.openSync(path.join(root, 'helper.ts'), 'r');
  const handle = await fsp.open(app, 'r');
  const stream = fs.createReadStream(app, { encoding: 'utf8' });
  owner.replace(owner.stage({ 'App.tsx': 'B' }));
  assert.equal(fs.readFileSync(app, 'utf8'), 'B');
  assert.equal(fs.readFileSync(descriptor, 'utf8'), 'old helper');
  assert.equal(await handle.readFile('utf8'), 'A');
  let streamed = ''; for await (const text of stream) streamed += text;
  assert.equal(streamed, 'A');
  assert.equal(fs.existsSync(path.join(root, 'helper.ts')), false);
  assert.throws(() => fs.watch(root), /Unsupported/);
  assert.throws(() => fs.writeFileSync(app, 'unsafe'), /Unsupported/);
  await assert.rejects(async () => fsp.rename(path.join(root, '../outside.ts'), app), /Unsupported/);
  fs.closeSync(descriptor); await handle.close();
  owner.dispose();
  assert.equal(fs.readFileSync(path.join(root, 'disk-only.ts'), 'utf8'), 'disk ghost');
  console.log('routing and descriptor assertions passed');
`

async function runRoutingFixture(directory: string, root: string): Promise<void> {
  await Try(async () => {
    const result = await Exec.captureStdout('node', [
      '-e',
      `(async () => {${routingScript}})().catch(error => { console.error(error); process.exit(1) })`,
      Path.join(directory, 'GeneratedFileSystem.js'),
      root,
    ])
    Tests.expect(result).toContain('routing and descriptor assertions passed')
  }, {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
}
