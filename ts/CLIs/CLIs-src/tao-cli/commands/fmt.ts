import * as CLIKit from '@cli-kit'
import { Lists, Regxs, Sort, UserInput } from '@shared'
import { Files, FS, Path } from '@shared/os'

import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { updateTaoSource } from '../../dev-cli/source/TaoSource'
import { withProjectSessions } from '../ProjectCommand'

/** fmtCommand formats complete declarations in the requested Tao source files. */
export default registerCommand({
  name: 'fmt',
  description: 'Format Tao source files or directories, preserving incomplete declarations.',
  arguments: [{ name: 'paths', required: true, variadic: true, description: 'Tao files or directories to format.' }],
  options: [{ flags: '--session <id>', description: 'Use a named project session lock.' }],
  async action(paths: string[], options: { session?: string } = {}) {
    const resolved = paths.map(CLIKit.resolveCallerPath)
    const sourceFiles = Lists.unique((await Promise.all(resolved.map(findFormatFiles))).flat())
    const projectPaths = Lists.unique([...resolved, ...sourceFiles])
    await withProjectSessions(projectPaths, async () => {
      for (const path of sourceFiles) {
        await updateTaoSource(path, 'format')
      }
    }, options.session)
  },
})

async function findFormatFiles(path: string): Promise<string[]> {
  if (FS.existsSync(path)) {
    const physical = FS.realpathSync(path)
    UserInput.require(
      !isExcludedFormatPath(path) && !isExcludedFormatPath(physical),
      `Cannot format generated or dependency source: ${path}`,
    )
    const info = FS.statSync(physical)
    if (info.isDirectory()) {
      const files = await Files.walk(path)
      return files.filter(file => Regxs.TaoSourceExtensionRegx.test(file)).sort(Sort.CompareStrings)
    }
    if (info.isFile() && Regxs.TaoSourceExtensionRegx.test(path)) {
      return [path]
    }
  }
  return UserInput.fail(`Expected a .tao file or directory: ${path}`)
}

function isExcludedFormatPath(path: string): boolean {
  return Path.toPortablePath(path).split('/').some(segment => Files.skipDirectory(segment))
}
