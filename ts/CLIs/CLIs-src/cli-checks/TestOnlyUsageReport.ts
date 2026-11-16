import { NewlineCharacter, S, Time, Try } from '@shared'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { IO } from '../cli-kit/cli-kit'
import { readPackageApis } from './PackageApis'
import * as TestOnlyUsage from './TestOnlyUsage'
import { ExternalWorkspaceEntries, readWorkspaceEntries, type WorkspaceEntries } from './WorkspaceEntries'

const ReportFilename = 'test-only-usage.md'

/** reportTestOnlyUsage writes source-review candidates without adding failure conditions to check. */
export async function reportTestOnlyUsage(
  root: string,
  program: TypeScript.Program,
  filenames: readonly string[],
): Promise<void> {
  await Try(async () => {
    const started = Time.nowMs()
    const roots = await readUsageRoots(root)
    const usage = TestOnlyUsage.analyzeTestOnlyUsage(program, filenames, roots)
    const renderModule = createModuleFormatter(root)
    const modules = usage.modules.map(renderModule)
    const declarations = usage.declarations.map(item => formatNamedUsage(root, item))
    const optionalArguments = usage.optionalArguments.map(item => formatNamedUsage(root, item))
    const report = S`
      # Test-only production usage candidates

      TypeScript references from tests had no matching use in the scanned production sources.
      Verify external or generated callers and package contracts before changing an API.

      ## Modules (${modules.length})

      ${modules.join(NewlineCharacter)}

      ## Exported declarations (${declarations.length})

      ${declarations.join(NewlineCharacter)}

      ## Optional arguments (${optionalArguments.length})

      These functions have direct calls in production and tests. Only the observed test calls
      supply the listed argument position.

      ${optionalArguments.join(NewlineCharacter)}
    `
    await FS.write(Artifacts.resolvePath(ReportFilename), report + NewlineCharacter)
    const elapsed = Math.round(Time.nowMs() - started)
    const counts =
      `${modules.length} module(s), ${declarations.length} declaration(s), ${optionalArguments.length} optional argument(s)`
    IO.print(`Test-only usage candidates in ${elapsed}ms (${counts}). See .artifacts/${ReportFilename}`)
  }, { catch: error => IO.warn(`Could not produce the test-only usage report: ${String(error)}`) })
}

async function readUsageRoots(root: string): Promise<TestOnlyUsage.UsageRoots> {
  const workspace = Path.join(root, 'ts')
  const entries = resolveEntryPaths(workspace, await readWorkspaceEntries(workspace))
  const contracts = resolveEntryPaths(workspace, ExternalWorkspaceEntries)
  return { root, entries, contracts }
}

function resolveEntryPaths(workspace: string, entries: WorkspaceEntries): ReadonlySet<string> {
  return new Set(Object.entries(entries).flatMap(([pkg, paths]) => paths.map(path => Path.join(workspace, pkg, path))))
}

function createModuleFormatter(root: string): (usage: TestOnlyUsage.ModuleUsage) => string {
  const apis = readPackageApis(root).map(({ alias, filename }) => ({
    alias,
    path: Path.toPortablePath(filename),
  }))
  return ({ file, testReference }) => {
    const path = Path.toPortablePath(file)
    const alias = apis.find(api => api.path === path)?.alias
    const entry = alias ? ` (manifest entry \`${alias}\`)` : ''
    const location = formatLocation(root, testReference)
    return `- \`${Path.relative(root, file)}\`${entry} reached from \`${location}\``
  }
}

function formatLocation(root: string, location: TestOnlyUsage.UsageLocation): string {
  return `${Path.relative(root, location.file)}:${location.line}`
}

type NamedUsage = {
  name: string
  declaration: TestOnlyUsage.UsageLocation
  testReference: TestOnlyUsage.UsageLocation
}

function formatNamedUsage(root: string, { name, declaration, testReference }: NamedUsage): string {
  const declared = formatLocation(root, declaration)
  const used = formatLocation(root, testReference)
  return `- \`${declared}\` \`${name}\` used in \`${used}\``
}
