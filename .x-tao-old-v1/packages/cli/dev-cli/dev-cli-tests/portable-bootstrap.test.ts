import { CLI, FS, Platform, Repo } from '@shared'
import { Describe, Expect, mkTestDir, Test } from '@shared/test'

Describe('portable contributor bootstrap', () => {
  for (const mode of ['legacy-tools', 'root-setup', 'legacy-verify'] as const) {
    const rootWorkspace = mode !== 'legacy-tools'
    const rootSetup = mode === 'root-setup'
    Test(
      rootSetup
        ? 'runs root TypeScript setup using the relocated portable tool definitions'
        : mode === 'legacy-verify'
        ? 'keeps CI verification setup in the legacy workspace when root TypeScript exists'
        : 'uses the nested implementation workspace and leaves canonical config at checkout root',
      async () => {
        const checkout = await mkTestDir('nested-portable-bootstrap-')
        try {
          const script = FS.resolvePath('.config/bootstrap-tao-dev-env', checkout)
          const workspace = FS.resolvePath('.x-tao-old-v1', checkout)
          const bin = FS.resolvePath('fixture-bin', checkout)
          const environment = FS.resolvePath('packages/cli/dev-cli/dev-cli-src/environment', workspace)
          const rootConfig = FS.resolvePath('.config/canonical-marker', checkout)
          await FS.writeText(script, await FS.readText(Repo.resolveGitPath('.config/bootstrap-tao-dev-env')))
          await FS.writeText(rootConfig, 'canonical config')
          await FS.writeText(FS.resolvePath('package.json', workspace), '{}')
          await FS.writeText(FS.resolvePath('devenv.lock', workspace), 'nested lock')
          await FS.writeText(FS.resolvePath('toolchain-packages.nix', environment), 'tool definition')
          await FS.writeText(FS.resolvePath('portable-profile.nix', environment), 'profile definition')
          if (rootWorkspace) {
            await FS.writeText(FS.resolvePath('ts/package.json', checkout), '{}')
            await FS.writeText(FS.resolvePath('devenv.lock', checkout), 'root lock')
          }
          const executable = async (path: string, body: string) => {
            await FS.writeText(path, `#!/bin/sh\nset -eu\n${body}\n`)
            await FS.chmod(path, 0o755)
          }
          await executable(
            FS.resolvePath('uname', bin),
            'case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; *) echo "Linux x86_64" ;; esac',
          )
          await executable(FS.resolvePath('flock', bin), ':')
          await executable(
            FS.resolvePath('agent', checkout),
            'test "$PWD" = "$TAO_BOOTSTRAP_TEST_CHECKOUT"; test "$*" = setup; test "$(command -v bun)" = "$PWD/.devenv/profile/bin/bun"; printf "root setup\\n" > setup-called',
          )
          await executable(
            FS.resolvePath('just', bin),
            'test "$PWD" = "$TAO_BOOTSTRAP_TEST_CHECKOUT/.x-tao-old-v1"; printf "%s\\n" "$*" >> setup-steps',
          )
          await executable(
            FS.resolvePath('nix-build', bin),
            '[ -f "$1" ]; [ "$2" = --out-link ]; mkdir -p "$3/bin"; for tool in bun node zsh; do printf "#!/bin/sh\\nexit 0\\n" > "$3/bin/$tool"; chmod +x "$3/bin/$tool"; done',
          )

          const result = await CLI.run('/bin/sh', {
            args: rootSetup ? [script] : [script, mode === 'legacy-verify' ? '--verify-setup' : '--tools-only'],
            cwd: checkout,
            env: {
              ...Platform.runtimeProcess.env,
              HOME: FS.resolvePath('home', checkout),
              TAO_BOOTSTRAP_TEST_CHECKOUT: checkout,
              PATH: `${bin}:${Platform.runtimeProcess.env['PATH'] ?? ''}`,
            },
          })
          Expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: '' })
          Expect(await FS.exists(FS.resolvePath('.devenv/profile', workspace))).toBe(false)
          Expect(
            await FS.exists(FS.resolvePath(rootSetup ? '.devenv/profile' : '.devenv/.x-tao-old-v1/profile', checkout)),
          ).toBe(true)
          if (rootSetup) {
            Expect(await FS.readText(FS.resolvePath('setup-called', checkout))).toBe('root setup\n')
          }
          if (mode === 'legacy-verify') {
            const steps = await FS.readText(FS.resolvePath('setup-steps', workspace))
            Expect(steps.trim().split('\n').sort()).toEqual([
              '--no-deps _parser-gen',
              '--no-deps _tao-project-deps',
              '--no-deps native-bindings',
              '_deps',
            ])
            Expect(await FS.exists(FS.resolvePath('setup-called', checkout))).toBe(false)
          }
          Expect(await FS.exists(FS.resolvePath('.config', workspace))).toBe(false)
          Expect(await FS.readText(rootConfig)).toBe('canonical config')
        } finally {
          await FS.remove(checkout)
        }
      },
    )
  }

  Test('reuses a locked generation and preserves it when a changed lock cannot build', async () => {
    const root = await mkTestDir('portable-bootstrap-')
    try {
      const script = FS.resolvePath('.config/bootstrap-tao-dev-env', root)
      const bin = FS.resolvePath('fixture-bin', root)
      const environment = FS.resolvePath('packages/cli/dev-cli/dev-cli-src/environment', root)
      const calls = FS.resolvePath('calls', root)
      const configLog = FS.resolvePath('nix-config', root)
      await FS.writeText(script, await FS.readText(Repo.resolveGitPath('.config/bootstrap-tao-dev-env')))
      await FS.writeText(FS.resolvePath('devenv.lock', root), 'first lock')
      await FS.writeText(FS.resolvePath('toolchain-packages.nix', environment), 'tool definition')
      await FS.writeText(FS.resolvePath('portable-profile.nix', environment), 'profile definition')
      const executable = async (path: string, body: string) => {
        await FS.writeText(path, `#!/bin/sh\nset -eu\n${body}\n`)
        await FS.chmod(path, 0o755)
      }
      await executable(
        FS.resolvePath('uname', bin),
        'case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; *) echo "Linux x86_64" ;; esac',
      )
      // The real kernel lock is exercised in the Linux guest; this fixture tests publication on macOS too.
      await executable(FS.resolvePath('flock', bin), ':')
      await executable(
        FS.resolvePath('nix-build', bin),
        `
printf 'build\\n' >> "$TAO_BOOTSTRAP_TEST_CALLS"
printf '%s' "\${NIX_CONFIG:-}" > "$TAO_BOOTSTRAP_TEST_CONFIG"
if [ "\${TAO_BOOTSTRAP_TEST_FAIL:-}" = yes ]; then exit 23; fi
[ "$2" = --out-link ]
mkdir -p "$3/bin"
for tool in bun node zsh; do
  printf '#!/bin/sh\\nexit 0\\n' > "$3/bin/$tool"
  chmod +x "$3/bin/$tool"
done`,
      )
      await executable(FS.resolvePath('agent', root), 'printf "agent %s\\n" "$*" >> "$TAO_BOOTSTRAP_TEST_CALLS"')
      const env = {
        ...Platform.runtimeProcess.env,
        HOME: FS.resolvePath('home', root),
        PATH: `${bin}:${Repo.resolvePath('.devenv/profile/bin')}:${Platform.runtimeProcess.env['PATH'] ?? ''}`,
        TAO_BOOTSTRAP_TEST_CALLS: calls,
        TAO_BOOTSTRAP_TEST_CONFIG: configLog,
        NIX_CONFIG: 'keep-outputs = true',
      }
      const first = await CLI.run('/bin/sh', { args: [script], cwd: root, env })
      Expect(first.exitCode).toBe(0)
      Expect(await FS.readText(configLog)).toBe('keep-outputs = true')
      const profile = FS.resolvePath('.devenv/profile', root)
      const firstTarget = await FS.realPath(profile)
      const cached = await CLI.run('/bin/sh', { args: [script, '--tools-only'], cwd: root, env })
      Expect(cached.exitCode).toBe(0)
      Expect(await FS.readText(calls)).toBe('build\nagent setup\n')
      Expect(await FS.realPath(profile)).toBe(firstTarget)

      await FS.writeText(FS.resolvePath('devenv.lock', root), 'changed lock')
      const failed = await CLI.run('/bin/sh', {
        args: [script],
        cwd: root,
        env: { ...env, TAO_BOOTSTRAP_TEST_FAIL: 'yes' },
      })
      Expect(failed.exitCode).toBe(23)
      Expect(await FS.realPath(profile)).toBe(firstTarget)
      Expect(await FS.readText(calls)).toBe('build\nagent setup\nbuild\n')

      const marker = FS.resolvePath('home/.local/state/tao-contributor/nix-bootstrap', root)
      await FS.writeText(marker, `${await FS.realPath(FS.resolvePath('nix-build', bin))}\n`)
      const managed = await CLI.run('/bin/sh', { args: [script, '--tools-only'], cwd: root, env })
      Expect(managed.exitCode).toBe(0)
      Expect(await FS.readText(configLog)).toBe(
        'keep-outputs = true\nstore = local\nbuild-users-group =\nsandbox = false',
      )

      await FS.writeText(marker, '/an-unrelated-installation/nix-build\n')
      await FS.writeText(FS.resolvePath('devenv.lock', root), 'another lock')
      const unrelated = await CLI.run('/bin/sh', { args: [script, '--tools-only'], cwd: root, env })
      Expect(unrelated.exitCode).toBe(0)
      Expect(await FS.readText(configLog)).toBe('keep-outputs = true')

      const callsBeforePartial = await FS.readText(calls)
      const targetBeforePartial = await FS.realPath(profile)
      await FS.writeText(`${marker}.pending`, 'interrupted installation\n')
      const partial = await CLI.run('/bin/sh', { args: [script, '--tools-only'], cwd: root, env })
      Expect(partial.exitCode).toBe(1)
      Expect(await FS.readText(calls)).toBe(callsBeforePartial)

      await FS.writeText(
        FS.resolvePath('nix-bootstrap.sh', environment),
        await FS.readText(Repo.resolvePath('packages/cli/dev-cli/dev-cli-src/environment/nix-bootstrap.sh')),
      )
      const interrupted = await CLI.run('/bin/sh', {
        args: [script, '--install-nix', '--tools-only'],
        cwd: root,
        env,
      })
      Expect(interrupted.exitCode).toBe(1)
      Expect(await FS.exists(`${marker}.pending`)).toBe(true)

      // Model the first installer completing while the second waits on its lock.
      // The real installer must arbitrate the marker before the profile can be reused.
      await executable(
        FS.resolvePath('flock', bin),
        `
if [ "$1" = -w ]; then
  printf 'lock acquired\\n' >> "$TAO_BOOTSTRAP_TEST_CALLS"
  rm -f "$HOME/.local/state/tao-contributor/nix-bootstrap.pending"
fi`,
      )
      const overlapping = await CLI.run('/bin/sh', {
        args: [script, '--install-nix', '--tools-only'],
        cwd: root,
        env,
      })
      Expect({ exitCode: overlapping.exitCode, stderr: overlapping.stderr }).toEqual({ exitCode: 0, stderr: '' })
      Expect(await FS.exists(`${marker}.pending`)).toBe(false)
      Expect(await FS.readText(calls)).toBe(`${callsBeforePartial}lock acquired\nlock acquired\n`)
      Expect(await FS.realPath(profile)).toBe(targetBeforePartial)
    } finally {
      await FS.remove(root)
    }
  })
})
