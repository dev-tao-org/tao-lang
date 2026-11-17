import { NewlineCharacter, S } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { readPackageApis } from './PackageApis'
import * as TestOnlyUsage from './TestOnlyUsage'
import { ExternalWorkspaceEntries, readWorkspaceEntries, type WorkspaceEntries } from './WorkspaceEntries'

/** TestOnlyUsageReport packages a review document with its finding counts. */
export type TestOnlyUsageReport = {
  markdown: string
  moduleCount: number
  declarationCount: number
  optionalArgumentCount: number
}

/** readTestOnlyUsageReport lists source-review candidates from an existing compiler program. */
export async function readTestOnlyUsageReport(
  root: string,
  program: TypeScript.Program,
  filenames: readonly string[],
): Promise<TestOnlyUsageReport> {
  const roots = await readUsageRoots(root)
  const usage = TestOnlyUsage.analyzeTestOnlyUsage(program, filenames, roots)
  const renderModule = createModuleFormatter(root)
  const modules = usage.modules.map(renderModule)
  const declarations = usage.declarations.map(item => formatNamedUsage(root, item))
  const optionalArguments = usage.optionalArguments.map(item => formatNamedUsage(root, item))
  const markdown = S`
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
  ` + NewlineCharacter
  return {
    markdown,
    moduleCount: modules.length,
    declarationCount: declarations.length,
    optionalArgumentCount: optionalArguments.length,
  }
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
