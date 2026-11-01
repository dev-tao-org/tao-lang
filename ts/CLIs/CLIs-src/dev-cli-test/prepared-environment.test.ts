import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('prepared activation retains toolchain values, rejects changed inputs and avoids another shell activation', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/prepared-environment-'))
  await Try(async () => {
    await prepareFixture(root)
    const output = await Platform.capture('sh', {
      variadicArgs: ['-ec', activationFixture(), Path.join(root, 'agent')],
    })
    Tests.expect(output).toContain('JAVA:/fixture/jdk with spaces')
    Tests.expect(output).toContain('SDK:/fixture/sdk')
    Tests.expect(output).toContain(`ROOT:${root}`)
    Tests.expect(output).toContain('REFRESH:required')
    Tests.expect(output).toContain('PROFILE:required')
    Tests.expect(output).toContain('SECRET:absent')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function prepareFixture(root: string): Promise<void> {
  await FileSystem.mkdirs(Path.join(root, '.config'), Path.join(root, '.devenv'), Path.join(root, 'tools/bin'))
  for (const file of ['devenv.nix', 'devenv.yaml', 'devenv.lock']) {
    await FileSystem.writeFile(Path.join(root, file), '', 'utf8')
  }
  for (const file of ['cli-environment.sh', 'prepared-environment.sh']) {
    await FileSystem.cp(Repo.resolvePath('.config', file), Path.join(root, '.config', file))
  }
  for (const tool of ['bun', 'node']) {
    const path = Path.join(root, 'tools/bin', tool)
    await FileSystem.writeFile(path, '#!/bin/sh\nexit 0\n', 'utf8')
    await FileSystem.chmod(path, 0o755)
  }
  await FileSystem.symlink(Path.join(root, 'tools'), Path.join(root, '.devenv/profile'))
}

function activationFixture(): string {
  return S`
    repository=$(dirname "$0")
    . "$repository/.config/prepared-environment.sh"
    tao_environment_key=$(tao_environment_identity "$repository")
    export TAO_ENVIRONMENT_INPUTS="$tao_environment_key"
    export JAVA_HOME='/fixture/jdk with spaces' ANDROID_HOME=/fixture/sdk
    export TAO_TEST_SECRET=private
    tao_record_prepared_environment
    unset JAVA_HOME ANDROID_HOME TAO_TEST_SECRET TAO_DEVENV DEVENV_ROOT
    . "$repository/.config/cli-environment.sh"
    printf 'JAVA:%s\nSDK:%s\nROOT:%s\nSECRET:%s\n' "$JAVA_HOME" "$ANDROID_HOME" "$DEVENV_ROOT" "$(printenv TAO_TEST_SECRET || printf absent)"
    printf changed >> "$repository/devenv.lock"
    tao_environment_key=$(tao_environment_identity "$repository")
    if tao_read_prepared_environment "$repository"; then exit 1; fi
    printf 'REFRESH:required\n'
    printf '' > "$repository/devenv.lock"
    tao_environment_key=$(tao_environment_identity "$repository")
    rm "$repository/.devenv/profile"
    if tao_read_prepared_environment "$repository"; then exit 1; fi
    printf 'PROFILE:required\n'
  `
}
