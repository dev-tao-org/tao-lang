import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

Tests.test('repository fix restores its own missing analysis alias', async () => {
  await FS.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/alias-repair-'))
  await Try(async () => {
    await copyFixWorkspace(root)
    const workspace = Path.join(root, 'ts')
    const config = Path.join(workspace, 'tsconfig.base.json')
    const expected = await removeAnalysisAlias(config)
    const command = ['./CLIs/CLIs-src/agent-cli/agent-cli.ts', 'fix']
    await Exec.captureStdout('bun', ['run', ...command], { cwd: workspace })
    Tests.expect(await FS.readJson(config)).toEqual(expected)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

type DependencyDirectory = { source: string; destination: string }

async function copyFixWorkspace(root: string): Promise<void> {
  await FS.mkdir(Path.join(root, '.git'))
  await FS.cp(Repo.resolvePath('Justfile'), Path.join(root, 'Justfile'))
  const formatter = await FS.readFile(Repo.resolvePath('.config/dprint.jsonc'), 'utf8')
  await FS.writeFile(Path.join(root, '.dprint.jsonc'), formatter.replaceAll('../ts/', './ts/'))
  const dependencies: DependencyDirectory[] = []
  await FS.cp(Repo.resolvePath('ts'), Path.join(root, 'ts'), {
    recursive: true,
    verbatimSymlinks: true,
    filter(source, destination) {
      if (Path.basename(source) === 'node_modules') {
        dependencies.push({ source, destination })
        return false
      }
      return true
    },
  })
  await Promise.all(dependencies.map(({ source, destination }) => FS.symlink(source, destination, 'junction')))
}

type FixtureCompilerPaths = Record<string, string[]>
type FixtureCompilerConfig = { compilerOptions: { paths: FixtureCompilerPaths } }

async function removeAnalysisAlias(path: string): Promise<FixtureCompilerConfig> {
  const expected = await FS.readJson(path) as FixtureCompilerConfig
  const reduced = await FS.readJson(path) as FixtureCompilerConfig
  delete reduced.compilerOptions.paths['@repo-analysis']
  await FS.writeJson(path, reduced)
  return expected
}
