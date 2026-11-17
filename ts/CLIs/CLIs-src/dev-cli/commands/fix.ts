import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import { FS, Repo } from '@shared/os'
import { assertNewWorkspaceTree } from '../../cli-checks/check'
import { workspaceFormat } from '../../cli-checks/workspace-format'
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
      const RepoAnalysisFix = await import('@tao/repo-analysis/fix')
      RepoAnalysisFix.synchronizePackageApis()
      const excludedFiles = options.exclude ?? []
      const changed = await RepoAnalysisFix.fixSourceConformance(Repo.getWorkspaceRoot(), { excludedFiles })
      IO.print(`Fixed source conformance: ${changed} file(s)`)
      await workspaceFormat('fmt', Repo.getWorkspaceRoot(), { excludedPaths: excludedFiles })
      return
    }
    UserInput.Require(!options.exclude?.length, '--exclude applies to repository fixes without named Tao source files.')
    for (const path of paths) {
      const absolute = Repo.resolvePath(path)
      Repo.assertNewWorkspacePath(absolute)
      if (!path.endsWith('.tao') || !FS.statSync(absolute).isFile()) {
        UserInput.Fail(`Fixing requires a Tao source file: ${path}`)
      }
      await updateTaoSource(absolute, 'fix')
    }
  },
})
