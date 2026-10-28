import { Errors, Regxs, Try } from '@shared'
import { Files, FileSystem, Path } from '@shared/os'
import type { SidecarCommandResult } from './ManagedModuleTypes'

type ForeignViewParameterTypes = Record<string, string>

/** ForeignViewContractOwnership marks contract files managed by Tao. */
export const ForeignViewContractOwnership = 'managed-by-tao\n'

/** ContractExecutor runs the pinned TypeScript compiler in the module context. */
export type ContractExecutor = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<SidecarCommandResult>

/** ForeignViewContract describes the public props expected from an exact named TypeScript export. */
export type ForeignViewContract = {
  directory: string
  name: string
  parameters: ForeignViewParameterTypes
  exportFile: string
  compiler: string
}

/** ForeignViewContractSourceInput carries the named export and props used to create its compiler contract. */
export type ForeignViewContractSourceInput = {
  name: string
  parameters: ForeignViewParameterTypes
  exportRelativePath: string
}

/** createForeignViewContractSource emits the module-local React component contract. */
export function createForeignViewContractSource(input: ForeignViewContractSourceInput): string {
  const importPath = input.exportRelativePath.replaceAll('\\', '/').replace(Regxs.TypeScriptModuleExtensionRegx, '')
  const parameters = Object.entries(input.parameters).map(([name, type]) => `  ${name}: ${type}`).join('\n')
  return `import type * as React from 'react'\nimport { ${input.name} as TaoForeignView } from ${
    JSON.stringify(
      importPath.startsWith('.') ? importPath : `./${importPath}`,
    )
  }\n\nexport type TaoForeignViewProps = {\n${parameters}\n}\n\nconst taoForeignViewContract: React.ComponentType<TaoForeignViewProps> = TaoForeignView\nvoid taoForeignViewContract\n`
}

/** checkForeignViewContract writes and type-checks a module-local React component contract. */
export async function checkForeignViewContract(
  contract: ForeignViewContract,
  executor: ContractExecutor,
): Promise<string> {
  if (!Regxs.JavaScriptIdentifierRegx.test(contract.name)) {
    Errors.ThrowUserInput(`Invalid foreign view export name: ${contract.name}`)
  }
  const exportRelativePath = Path.relative(contract.directory, contract.exportFile)
  if (!Path.isWithin(contract.directory, contract.exportFile)) {
    Errors.ThrowUserInput(`Foreign view export must be inside its Tao module: ${contract.exportFile}`)
  }
  for (const name of Object.keys(contract.parameters)) {
    if (!Regxs.JavaScriptIdentifierRegx.test(name)) {
      Errors.ThrowUserInput(`Invalid foreign view parameter name: ${name}`)
    }
  }
  const file = Path.join(contract.directory, `.tao-${contract.name}.contract.ts`)
  const source = createForeignViewContractSource({
    name: contract.name,
    parameters: contract.parameters,
    exportRelativePath,
  })
  await writeOwnedContract(file, source)
  const result = await executor(contract.compiler, [
    '--noEmit',
    '--pretty',
    'false',
    '--project',
    Path.join(contract.directory, 'tsconfig.json'),
  ], contract.directory)
  if (result.status !== 0) {
    Errors.ThrowUserInput(
      `Foreign view ${contract.name} does not satisfy its declared props contract. ${result.stderr || result.stdout}`,
    )
  }
  return file
}

async function writeOwnedContract(path: string, contents: string): Promise<void> {
  const marker = `${path}.tao-managed`
  const ownership = await Try.WithDefault(undefined, () => FileSystem.readFile(marker, 'utf8'))
  if (await FileSystem.exists(path) && ownership !== ForeignViewContractOwnership) {
    Errors.ThrowUserInput(`Foreign view contract path is already owned: ${path}`)
  }
  if (ownership === undefined) {
    await Files.writeReadOnly(marker, ForeignViewContractOwnership)
  }
  await Files.writeReadOnly(path, contents)
}
