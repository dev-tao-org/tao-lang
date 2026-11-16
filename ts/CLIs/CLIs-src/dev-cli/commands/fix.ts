import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { FS, Repo } from '@shared/os'
import { synchronizePackageApis } from '../../../../repo-analysis/repo-analysis-src/Workspace/PackageApis'
import { assertNewWorkspaceTree, workspaceFormat } from '../../cli-checks/check'
import { updateTaoSource } from '../source/TaoSource'
import { registerCommand } from './_command-runner'

type FixCommandOptions = { exclude?: string[] }

/** fixCommand applies the available new-workspace fixes. */
export default registerCommand({
  name: 'fix',
  description:
    'Fix and format named Tao source files, or fix TypeScript style and format the repository when no paths are given.',
  arguments: [{ name: 'paths', description: 'Repository-relative Tao source files.', variadic: true }],
  options: [{ flags: '--exclude <paths...>', description: 'Leave these paths unchanged during repository fixes.' }],
  async action(paths: string[], options: FixCommandOptions = {}) {
    if (paths.length === 0) {
      await assertNewWorkspaceTree()
      synchronizePackageApis()
      const SourceConformance = await import(
        '../../../../repo-analysis/repo-analysis-src/Source/source-conformance-fix'
      )
      const excludedFiles = options.exclude ?? []
      const changed = await SourceConformance.fixSourceConformance(Repo.getWorkspaceRoot(), { excludedFiles })
      IO.print(`Fixed source conformance: ${changed} file(s)`)
      await workspaceFormat('fmt', excludedFiles)
      return
    }
    if (options.exclude?.length) {
      Errors.ThrowUserInput('--exclude applies to repository fixes without named Tao source files.')
    }
    for (const path of paths) {
      const absolute = Repo.resolvePath(path)
      Repo.assertNewWorkspacePath(absolute)
      if (!path.endsWith('.tao') || !FS.statSync(absolute).isFile()) {
        Errors.ThrowUserInput(`Fixing requires a Tao source file: ${path}`)
      }
      await updateTaoSource(absolute, 'fix')
    }
  },
})
