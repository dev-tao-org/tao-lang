import { Errors, Try } from '@shared'
import { Files, FileSystem, Path } from '@shared/os'
import type { SidecarCommandResult } from './ManagedModuleTypes'

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
  parameters: Record<string, string>
  exportFile: string
  compiler: string
}

/** checkForeignViewContract writes and type-checks a module-local React component contract. */
export async function checkForeignViewContract(
  contract: ForeignViewContract,
  executor: ContractExecutor,
): Promise<string> {
  if (!/^[A-Za-z_$][\w$]*$/.test(contract.name)) {
    Errors.ThrowUserInput(`Invalid foreign view export name: ${contract.name}`)
  }
  const exportRelativePath = Path.relative(contract.directory, contract.exportFile)
  if (!Path.isWithin(contract.directory, contract.exportFile)) {
    Errors.ThrowUserInput(`Foreign view export must be inside its Tao module: ${contract.exportFile}`)
  }
  for (const name of Object.keys(contract.parameters)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      Errors.ThrowUserInput(`Invalid foreign view parameter name: ${name}`)
    }
  }
  const file = Path.join(contract.directory, `.tao-${contract.name}.contract.ts`)
  const importPath = exportRelativePath.replaceAll('\\', '/').replace(/\.(?:tsx?|mts|cts)$/, '')
  const parameters = Object.entries(contract.parameters).map(([name, type]) => `  ${name}: ${type}`).join('\n')
  const source = `import type * as React from 'react'\nimport { ${contract.name} as TaoForeignView } from ${
    JSON.stringify(
      importPath.startsWith('.') ? importPath : `./${importPath}`,
    )
  }\n\nexport type TaoForeignViewProps = {\n${parameters}\n}\n\nconst taoForeignViewContract: React.ComponentType<TaoForeignViewProps> = TaoForeignView\nvoid taoForeignViewContract\n`
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
  if (await FileSystem.exists(path) && ownership !== 'managed-by-tao\n') {
    Errors.ThrowUserInput(`Foreign view contract path is already owned: ${path}`)
  }
  if (ownership === undefined) {
    await Files.writeReadOnly(marker, 'managed-by-tao\n')
  }
  await Files.writeReadOnly(path, contents)
}
