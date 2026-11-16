import * as CLIKit from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { Path, Repo } from '@shared/os'
import { assertNewWorkspaceTree } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'

/** dependencyAddCommand installs an exact registry pin into an existing TypeScript workspace package. */
export default registerCommand({
  name: 'dependency-add',
  description: 'Add an approved, exact registry dependency to a TypeScript workspace package.',
  arguments: [
    { name: 'workspace-package', required: true, description: 'Package directory relative to ts/.' },
    { name: 'dependency', required: true, description: 'Registry package and exact version, such as zod@4.1.0.' },
  ],
  options: [{ flags: '--dev', description: 'Add the dependency to devDependencies.' }],
  async action(workspacePackage: string, dependency: string, options: { dev?: boolean }) {
    requireRegistryPin(dependency)
    const cwd = await requireWorkspacePackageDirectory(workspacePackage)
    const args = ['add', '--exact', '--ignore-scripts', ...(options.dev ? ['--dev'] : []), dependency]
    await CLIKit.runNonInteractiveCommand('bun', args, { cwd })
  },
})

function requireRegistryPin(dependency: string): void {
  if (!Regxs.RegistryDependencyPinRegx.test(dependency)) {
    Errors.ThrowUserInput('Specify a registry package with an exact version, such as zod@4.1.0.')
  }
}

async function requireWorkspacePackageDirectory(workspacePackage: string): Promise<string> {
  const workspace = Repo.resolvePath('ts')
  const directory = Path.resolve(workspace, workspacePackage)
  Repo.assertNewWorkspacePath(directory, workspace)
  await assertNewWorkspaceTree()
  const RepoAnalysis = await import('@repo-analysis')
  const manifests = await RepoAnalysis.readWorkspaceManifestPaths(workspace)
  const manifest = manifests.find(candidate => Path.relative(directory, Path.dirname(candidate)) === '')
  if (!manifest) {
    Errors.ThrowUserInput(`Expected a declared workspace package directory under ts/: ${workspacePackage}`)
  }
  Repo.assertNewWorkspacePath(manifest, workspace)
  return directory
}
