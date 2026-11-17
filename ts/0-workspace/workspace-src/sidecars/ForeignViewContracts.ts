import * as Compile from '@compile'
import { NewlineCharacter, Regxs, Try, UserInput } from '@shared'
import { Files, FS, Path } from '@shared/os'
import type { SidecarCommandResult } from './ManagedModule/ManagedModuleTypes'

/** ForeignViewContractOwnership marks contract files managed by Tao. */
export const ForeignViewContractOwnership = 'managed-by-tao' + NewlineCharacter

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
  parameters: Compile.ForeignViewParameterTypes
  exportFile: string
  compiler: string
}

/** checkForeignViewContract writes and type-checks a module-local React component contract. */
export async function checkForeignViewContract(
  contract: ForeignViewContract,
  executor: ContractExecutor,
): Promise<string> {
  if (!Regxs.JavaScriptIdentifierRegx.test(contract.name)) {
    UserInput.fail(`Invalid foreign view export name: ${contract.name}`)
  }
  const exportRelativePath = Path.relative(contract.directory, contract.exportFile)
  if (!Path.isWithin(contract.directory, contract.exportFile)) {
    UserInput.fail(`Foreign view export must be inside its Tao module: ${contract.exportFile}`)
  }
  for (const name of Object.keys(contract.parameters)) {
    if (!Regxs.JavaScriptIdentifierRegx.test(name)) {
      UserInput.fail(`Invalid foreign view parameter name: ${name}`)
    }
  }
  const file = Path.join(contract.directory, `.tao-${contract.name}.contract.ts`)
  const source = Compile.createForeignViewContractSource({
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
    UserInput.fail(
      `Foreign view ${contract.name} does not satisfy its declared props contract. ${result.stderr || result.stdout}`,
    )
  }
  return file
}

async function writeOwnedContract(path: string, contents: string): Promise<void> {
  const marker = `${path}.tao-managed`
  const ownership = await Try.WithDefault(undefined, () => FS.readFile(marker, 'utf8'))
  if (await FS.exists(path) && ownership !== ForeignViewContractOwnership) {
    UserInput.fail(`Foreign view contract path is already owned: ${path}`)
  }
  if (ownership === undefined) {
    await Files.writeReadOnly(marker, ForeignViewContractOwnership)
  }
  await Files.writeReadOnly(path, contents)
}
