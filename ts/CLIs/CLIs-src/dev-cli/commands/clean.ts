import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import { Artifacts, Files, FS, Repo } from '@shared/os'
import * as Workspace from '@workspace'
import { registerCommand } from './_command-runner'

/** cleanCommand removes dependencies, all artifacts, or only expired successful temporary output. */
export default registerCommand({
  name: 'clean',
  description:
    'Remove dependencies; --full includes artifacts, --partial removes successful temporary output older than 24h.',
  arguments: [{ name: 'args', description: 'Optional --full or --partial flag.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    UserInput.Require(!!hasValidCleanArguments(args), 'Usage: clean [--full | --partial]')
    if (args.includes('--partial')) {
      const removed = await Artifacts.cleanPartial()
      IO.print(`Removed ${removed} temporary artifacts; retained caches, recent output, failures and active runs.`)
      return
    }
    const projectCleanup = await cleanAppProjects()
    IO.print(
      `Removed ${projectCleanup.removed} generated project cache entries across ${projectCleanup.projects} projects.`,
    )
    if (projectCleanup.active.length > 0) {
      IO.print(`Skipped active sessions: ${projectCleanup.active.join(', ')}`)
    }
    if (projectCleanup.protected > 0) {
      IO.print('Preserved project cache while session ownership was uncertain.')
    }
    await FS.rm(Repo.resolvePath('ts/1-grammar/_gen_parser'), { recursive: true, force: true })
    await FS.rm(Repo.resolvePath('ts/2-ast-gen/_gen_AST'), { recursive: true, force: true })
    await FS.rm(Repo.resolvePath('ts/7-runtime/_gen_runtime'), { recursive: true, force: true })
    await FS.rm(Repo.resolvePath('ts/node_modules'), { recursive: true, force: true })
    if (args.includes('--full')) {
      await Artifacts.rm(Artifacts.resolvePath(), { recursive: true, force: true })
    }
  },
})

function hasValidCleanArguments(args: readonly string[]): boolean {
  return args.length <= 1 && args.every(argument => argument === '--full' || argument === '--partial')
}

type CleanAppProjectsResult = { projects: number; removed: number; active: string[]; protected: number }

async function cleanAppProjects(): Promise<CleanAppProjectsResult> {
  const roots = await initializedProjects(Repo.resolvePath('Apps'))
  let removed = 0
  let protectedCount = 0
  const active: string[] = []
  for (const root of roots) {
    const result = await Workspace.cleanProject(root)
    for (const warning of result.warnings) {
      IO.warn(warning)
    }
    removed += result.removed.length
    if (result.sharedProtected) {
      protectedCount++
    }
    active.push(...result.skippedActive.map(id => `${root} (${id})`))
  }
  return { projects: roots.length, removed, active, protected: protectedCount }
}

async function initializedProjects(apps: string): Promise<string[]> {
  return await Files.findProjects(apps)
}
