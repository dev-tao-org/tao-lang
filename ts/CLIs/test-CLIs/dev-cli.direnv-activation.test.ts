import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

type RuntimeFixture = {
  home: string
  root: string
  runtime: string
  worktreeA: string
  worktreeB: string
}

Tests.test('reloading activation replaces an old hook and unloads an active disabled sibling worktree', async () => {
  const fixture = await createRuntimeFixture()
  await Try(async () => {
    const result = await runActivationHook(fixture, fixture.worktreeA)
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain('TAO_ACTIVE:unset')
    Tests.expect(result.stdout).toContain(`DIRENV_DIR:-${Path.dirname(fixture.root)}`)
    Tests.expect(await FS.file(Path.join(fixture.home, 'export-cwd')).text()).toBe(`${Path.dirname(fixture.root)}\n`)
    Tests.expect(FS.existsSync(Path.join(fixture.home, 'hook-called'))).toBe(false)
  }, {
    finally: () => FS.rm(Path.dirname(fixture.root), { recursive: true, force: true }),
  })
})

Tests.test('disabled shared setup preserves an unrelated active direnv environment', async () => {
  const fixture = await createRuntimeFixture()
  await Try(async () => {
    const result = await runActivationHook(fixture, Path.join(Path.dirname(fixture.root), 'unrelated'))
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain('TAO_ACTIVE:from-sibling-A')
    Tests.expect(result.stdout).toContain(`DIRENV_DIR:-${Path.join(Path.dirname(fixture.root), 'unrelated')}`)
    Tests.expect(FS.existsSync(Path.join(fixture.home, 'export-cwd'))).toBe(false)
    Tests.expect(FS.existsSync(Path.join(fixture.home, 'hook-called'))).toBe(false)
  }, {
    finally: () => FS.rm(Path.dirname(fixture.root), { recursive: true, force: true }),
  })
})

async function createRuntimeFixture(): Promise<RuntimeFixture> {
  const base = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-direnv-activation-'))
  const home = Path.join(base, 'home')
  const common = Path.join(base, 'common.git')
  const worktreeA = Path.join(base, 'worktree-a')
  const worktreeB = Path.join(base, 'worktree-b')
  const runtime = Repo.resolvePath('ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh')
  const record = Path.join(home, '.tao-dev/shell/repositories', 'a'.repeat(40))
  const bin = Path.join(home, 'bin')
  await FS.mkdirs(record, common, worktreeA, worktreeB, bin, Path.join(home, '.tao-dev/shell/direnv/bin'))
  await FS.writeFile(Path.join(record, 'choice'), 'disabled' + NewlineCharacter, 'utf8')
  await FS.writeFile(Path.join(record, 'common-dir'), `${common}${NewlineCharacter}`, 'utf8')
  await FS.writeFile(Path.join(worktreeB, '.envrc'), '# disabled worktree' + NewlineCharacter, 'utf8')
  await writeExecutable(Path.join(bin, 'git'), gitFixtureScript())
  await writeExecutable(
    Path.join(home, '.tao-dev/shell/direnv/bin/direnv'),
    direnvFixtureScript(),
  )
  return { home, root: worktreeB, runtime, worktreeA, worktreeB }
}

function gitFixtureScript(): string {
  return S`
    #!/bin/sh
    if [ "$1" = "-C" ]; then
      case "$3:$4:$5" in
        rev-parse:--show-toplevel:*) printf '%s\\n' "$2" ;;
        rev-parse:--path-format=absolute:--git-common-dir) printf '%s\\n' "$TAO_TEST_COMMON" ;;
      esac
      exit 0
    fi
    case "$1:$2:$3" in
      rev-parse:--show-toplevel:*) printf '%s\\n' "$TAO_TEST_ROOT" ;;
      rev-parse:--path-format=absolute:--git-common-dir) printf '%s\\n' "$TAO_TEST_COMMON" ;;
      hash-object:--stdin:*) printf '%s\\n' "$TAO_TEST_ID" ;;
      hash-object:--:*) printf 'fixture-fingerprint\\n' ;;
    esac
    case "$1:$2:$3" in
      --git-dir=*:worktree:list)
        printf 'worktree %s\\000worktree %s\\000' "$TAO_TEST_WORKTREE_A" "$TAO_TEST_WORKTREE_B"
        ;;
    esac
  `
}

function direnvFixtureScript(): string {
  return S`
    #!/bin/sh
    case "$1" in
      hook) printf '%s\\n' '_direnv_hook() { print -r -- invoked >> "$TAO_TEST_HOOK_LOG"; }' ;;
      export)
        printf '%s\\n' "$PWD" >> "$TAO_TEST_EXPORT_LOG"
        printf 'unset TAO_TEST_ACTIVE\\nexport DIRENV_DIR=-%s\\n' "$TAO_TEST_PARENT"
        ;;
    esac
  `
}

async function writeExecutable(path: string, source: string): Promise<void> {
  await FS.writeFile(path, source, 'utf8')
  await FS.chmod(path, 0o755)
}

async function runActivationHook(fixture: RuntimeFixture, activeRoot: string): Promise<{
  status: number
  stdout: string
}> {
  const parent = Path.dirname(fixture.root)
  const environment = {
    HOME: fixture.home,
    PATH: `${Path.join(fixture.home, 'bin')}:${Env.get('PATH') ?? ''}`,
    DIRENV_DIR: `-${activeRoot}`,
    TAO_TEST_ACTIVE: 'from-sibling-A',
    TAO_TEST_COMMON: Path.join(Path.dirname(fixture.root), 'common.git'),
    TAO_TEST_EXPORT_LOG: Path.join(fixture.home, 'export-cwd'),
    TAO_TEST_HOOK_LOG: Path.join(fixture.home, 'hook-called'),
    TAO_TEST_ID: 'a'.repeat(40),
    TAO_TEST_PARENT: parent,
    TAO_TEST_ROOT: fixture.root,
    TAO_TEST_RUNTIME: fixture.runtime,
    TAO_TEST_WORKTREE_A: fixture.worktreeA,
    TAO_TEST_WORKTREE_B: fixture.worktreeB,
  }
  const child = Exec.spawn('zsh', [
    '-fic',
    '_tao_dev_direnv_hook() { print -r -- stale >> "$TAO_TEST_HOOK_LOG"; }; source "$TAO_TEST_RUNTIME"; _tao_dev_direnv_hook; print -r -- "TAO_ACTIVE:${TAO_TEST_ACTIVE-unset}"; print -r -- "DIRENV_DIR:$DIRENV_DIR"',
  ], { cwd: fixture.root, addEnv: environment })
  const [status, stdout] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
  ])
  return { status, stdout }
}
