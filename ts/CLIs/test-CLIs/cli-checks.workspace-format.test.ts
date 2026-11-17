import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import { workspaceFormat } from '../CLIs-src/cli-checks/workspace-format'

Tests.test.skipIf(Path.sep === '\\')('formatting an exact filename leaves unrelated paths alone', async () => {
  const fixture = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/workspace-format-'))
  const root = Path.join(fixture, 'repo')
  const requested = 'config [x].json'
  const neighbor = 'config x.json'
  const original = '{"enabled":true}'
  await Try(async () => {
    await FS.mkdir(Path.join(root, 'ts'))
    await FS.symlink(fixture, Path.join(root, 'ts', 'unrelated'), 'dir')
    await FS.writeJson(Path.join(root, '.dprint.jsonc'), {
      plugins: [Repo.resolvePath('ts/0-workspace/node_modules/@dprint/json/plugin.wasm')],
    })
    await FS.writeFile(Path.join(root, requested), original)
    await FS.writeFile(Path.join(root, neighbor), original)

    await workspaceFormat('fmt', root, { paths: [requested] })
    Tests.expect(await FS.file(Path.join(root, requested)).text()).toBe('{ "enabled": true }' + NewlineCharacter)
    Tests.expect(await FS.file(Path.join(root, neighbor)).text()).toBe(original)
  }, { finally: () => FS.rm(fixture, { recursive: true, force: true }) })
})

const RecordingDprint = S`
  #!/bin/sh
  if [ "$1" = output-file-paths ]; then
    printf '%s\\n' "$TAO_FORMAT_REPORTED_PATH"
  else
    printf '%s\\n' "$1" > "$TAO_FORMAT_REWRITE_RECORD"
  fi
`

Tests.test.skipIf(Path.sep === '\\')('formatting refuses an escaping path reported by dprint selection', async () => {
  const fixture = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/workspace-format-'))
  await Try(async () => {
    const root = Path.join(fixture, 'repo')
    const outside = Path.join(fixture, 'outside.json')
    const reported = Path.join(root, 'subdir', 'escape.json')
    const record = Path.join(fixture, 'rewrites')
    const executable = Path.join(fixture, 'dprint')
    await FS.mkdir(Path.dirname(reported))
    await FS.writeFile(outside, '{}')
    await FS.symlink(outside, reported)
    await FS.writeFile(executable, RecordingDprint + NewlineCharacter)
    await FS.chmod(executable, 0o755)
    const addEnv = { PATH: fixture, TAO_FORMAT_REPORTED_PATH: reported, TAO_FORMAT_REWRITE_RECORD: record }
    await Tests.withEnv(addEnv, async () => {
      await Tests.expect(workspaceFormat('fmt', root, { paths: ['**/*.json'] })).rejects.toThrow('remain inside')
      await Tests.expect(workspaceFormat('fmt', root)).rejects.toThrow('remain inside')
    })
    Tests.expect(FS.existsSync(record)).toBe(false)
  }, { finally: () => FS.rm(fixture, { recursive: true, force: true }) })
})
