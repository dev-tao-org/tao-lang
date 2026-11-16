import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import { installSshConfig } from '../../CLIs-src/dev-cli/timing/SshKeyConfig'
import { readAuthenticatedKeyFingerprint } from '../../CLIs-src/dev-cli/timing/SshKeyDiagnostics'
import * as TimingReport from '../../CLIs-src/dev-cli/timing/TimingReport'

Tests.test('SSH setup identifies the key that signed the destination login from macOS logs', () => {
  const dedicated = 'SHA256:dedicated'
  const alternate = 'SHA256:alternate'
  const offer = `debug1: Server accepts key: /Users/fixture/.ssh/tao ED25519 ${dedicated} explicit`
  const first = `debug3: sign_and_send_pubkey: signing using ssh-ed25519 ${dedicated}`
  const fallback = `debug3: sign_and_send_pubkey: signing using ssh-ed25519 ${alternate}`
  const success = 'Authenticated to timing.invalid (via proxy) using "publickey".'
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first, success].join('\r\n'))).toBe(dedicated)
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first, fallback, success].join('\r\n'))).toBe(alternate)
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first].join('\r\n'))).toBeUndefined()
})

Tests.test('SSH key setup preserves user settings and replaces its own entry on rerun', async () => {
  if (Platform.systemInfo().os !== 'Darwin') {
    return
  }
  const root = Artifacts.resolvePath('tmp')
  await FS.mkdir(root)
  const directory = await FS.mkdtemp(Path.join(root, 'ssh-config-'))
  await Try(async () => {
    const config = Path.join(directory, 'config')
    const original = S`
      Host other
        User someone
      Host timing.invalid
        IdentitiesOnly no
        AddKeysToAgent no
        UseKeychain no
    ` + NewlineCharacter
    const host = 'ro@timing.invalid'
    const key = Path.join(directory, 'id_ed25519_tao_primary')
    await FS.writeFile(config, original)
    await installSshConfig(host, key, config)
    const installed = await FS.readFile(config, 'utf8')
    Tests.expect(installed.startsWith(original)).toBe(true)
    Tests.expect(installed).toContain('Match originalhost timing.invalid user ro')
    Tests.expect(installed).toContain('  IdentityFile ~/.ssh/id_ed25519_tao_primary')
    Tests.expect(installed).toContain('  UseKeychain yes')
    const resolved = await Exec.captureStdout('/usr/bin/ssh', ['-G', '-F', config, '--', host])
    Tests.expect(resolved).toContain('identitiesonly no')
    Tests.expect(resolved).toContain('addkeystoagent false')
    await installSshConfig(host, key, config)
    Tests.expect(await FS.readFile(config, 'utf8')).toBe(installed)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('timing job output requires one retained job in the selected checkout', () => {
  const tooling = '/Users/fixture/Timing'
  Tests.expect(() => TimingReport.readTimingJobPath('', tooling)).toThrow('one timing job identity')
  Tests.expect(() => TimingReport.readTimingJobPath('Performance job: /outside/jobs/fixture\n', tooling))
    .toThrow('inside this tooling checkout')
})
