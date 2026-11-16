import * as Tests from '@shared-tests'
import Exec from '@shared/os/exec'
import * as FS from '../../shared-src/os/FS'
import * as Path from '../../shared-src/os/Path'
import * as Platform from '../../shared-src/os/Platform'
import * as Repo from '../../shared-src/os/Repo'
import * as Artifacts from '../../shared-src/os/Storage/Artifacts'
import * as Bundle from '../../shared-src/os/Tooling/Bundle'
import { S, Try } from '../../shared-src/universal/universal'

Tests.test('generated and disk streams retain native pipe behavior through pinned graceful-fs constructors', async () => {
  const directory = Artifacts.resolvePath('tmp/generated-streams', Platform.randomUUID())
  const root = Path.join(directory, 'src')
  await Try(async () => {
    await FS.mkdir(Path.join(root, '_gen_runtime'))
    await FS.writeFile(Path.join(directory, 'outside.ts'), 'outside')
    await Bundle.bundleNode(Repo.resolvePath('ts/shared/shared-src/os/FS/GeneratedFileSystem.ts'), directory, [])
    const result = await Exec.captureStdout('node', [
      '-e',
      `(async () => {${streamScript}})().catch(error => { console.error(error); process.exit(1) })`,
      Path.join(directory, 'GeneratedFileSystem.js'),
      root,
      Repo.resolvePath('ts/7-runtime/package.json'),
    ])
    Tests.expect(result).toContain('native and graceful streams retain snapshot A')
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

const streamScript = S`
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { createRequire } = require('node:module');
  const { Writable } = require('node:stream');
  const { pipeline } = require('node:stream/promises');
  const NativeReadStream = fs.ReadStream;
  const { installGeneratedFileSystem } = require(process.argv[1]);
  const root = process.argv[2];
  const owner = installGeneratedFileSystem(root, { 'App.tsx': 'A' });
  const application = createRequire(process.argv[3]);
  const expo = createRequire(application.resolve('expo/package.json'));
  const cli = createRequire(expo.resolve('@expo/cli/package.json'));
  const graceful = cli('graceful-fs');
  const generated = path.join(root, 'App.tsx');
  const disk = path.join(root, '../outside.ts');
  const held = [];
  const routedOpen = fs.open;
  for (const reader of [fs, graceful]) {
    const constructors = [
      (file, options) => reader.createReadStream(file, options),
      (file, options) => new reader.ReadStream(file, options),
      (file, options) => new reader.FileReadStream(file, options),
      (file, options) => reader.ReadStream(file, options),
      (file, options) => reader.FileReadStream(file, options),
    ];
    for (const construct of constructors) {
      assert.throws(() => construct(generated, { fd: 123 }), /Unsupported.*stream descriptor/);
      held.push({ stream: construct(generated, 'utf8'), expected: 'A' });
      held.push({ stream: construct(disk, { encoding: 'utf8' }), expected: 'outside' });
      const descriptor = fs.openSync(disk, 'r');
      held.push({ stream: construct(disk, { fd: descriptor }), expected: 'outside' });
    }
  }
  assert.equal(fs.open, routedOpen);
  owner.replace(owner.stage({ 'App.tsx': 'B' }));
  assert.equal(fs.readFileSync(generated, 'utf8'), 'B');
  for (const { stream, expected } of held) {
    assert.ok(stream instanceof NativeReadStream);
    let received = '';
    await pipeline(stream, new Writable({ write(chunk, _encoding, done) { received += chunk; done(); } }));
    assert.equal(received, expected);
  }
  owner.dispose();
  console.log('native and graceful streams retain snapshot A');
`
