import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

Tests.test('repository fix restores its own missing analysis and performance aliases', async () => {
  await FS.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/alias-repair-'))
  await Try(async () => {
    await copyFixWorkspace(root)
    const workspace = Path.join(root, 'ts')
    const config = Path.join(workspace, 'tsconfig.base.json')
    const expected = await removeAnalysisAliases(config)
    const command = ['./CLIs/CLIs-src/agent-cli/agent-cli.ts', 'fix', '--exclude', 'Justfile']
    await Exec.captureStdout('bun', ['run', ...command], { cwd: workspace })
    Tests.expect(await FS.readJson(config)).toEqual(expected)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

type DependencyDirectory = { source: string; destination: string }

async function copyFixWorkspace(root: string): Promise<void> {
  await FS.mkdir(Path.join(root, '.git'))
  await writeFixFormatterConfig(root)
  const dependencies: DependencyDirectory[] = []
  await FS.cp(Repo.resolvePath('ts'), Path.join(root, 'ts'), {
    recursive: true,
    verbatimSymlinks: true,
    filter(source, destination) {
      const name = Path.basename(source)
      if (name === 'node_modules') {
        dependencies.push({ source, destination })
        return false
      }
      return !isTestDirectory(name)
    },
  })
  await Promise.all(dependencies.map(({ source, destination }) => FS.symlink(source, destination, 'junction')))
}

function isTestDirectory(name: string): boolean {
  return name.startsWith('test-') && Path.extname(name) === ''
}

async function writeFixFormatterConfig(root: string): Promise<void> {
  const config = {
    includes: ['ts/tsconfig.base.json'],
    plugins: [Repo.resolvePath('ts/0-workspace/node_modules/@dprint/json/plugin.wasm')],
  }
  await FS.writeJson(Path.join(root, '.dprint.jsonc'), config)
}

type FixtureCompilerPaths = Record<string, string[]>
type FixtureCompilerOptions = { paths: FixtureCompilerPaths; noLib?: boolean; types?: string[] }
type FixtureCompilerConfig = { compilerOptions: FixtureCompilerOptions }

async function removeAnalysisAliases(path: string): Promise<FixtureCompilerConfig> {
  const expected = await FS.readJson(path) as FixtureCompilerConfig
  expected.compilerOptions.noLib = true
  expected.compilerOptions.types = []
  await FS.writeJson(path, expected)
  const reduced = await FS.readJson(path) as FixtureCompilerConfig
  delete reduced.compilerOptions.paths['@repo-analysis']
  delete reduced.compilerOptions.paths['@repo-analysis/performance']
  await FS.writeJson(path, reduced)
  return expected
}
