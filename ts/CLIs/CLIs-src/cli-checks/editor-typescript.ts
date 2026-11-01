import { Errors } from '@shared'
import { FileSystem, Path, Platform, Repo } from '@shared/os'
import * as TypeScript from 'typescript'

/** checkEditorTypeScript verifies editor settings and the managed tsc executable against the pinned compiler. */
export async function checkEditorTypeScript(): Promise<void> {
  assertEditorTypeScript(await FileSystem.readFile(Repo.resolvePath('.vscode/settings.json'), 'utf8'))
  const actual = await Platform.capture('tsc --version')
  if (actual !== `Version ${TypeScript.version}`) {
    Errors.ThrowUserInput(
      `Managed tsc reports ${actual}; expected TypeScript ${TypeScript.version}. Run ./agent setup.`,
    )
  }
}

function assertEditorTypeScript(source: string): void {
  const parsed = TypeScript.parseConfigFileTextToJson('.vscode/settings.json', source)
  if (parsed.error) {
    Errors.ThrowUserInput('Cannot parse .vscode/settings.json for the editor TypeScript SDK.')
  }
  const settings = parsed.config as Record<string, unknown>
  const paths = [settings['typescript.tsdk'], settings['js/ts.tsdk.path']].filter(path => path !== undefined)
  const sdk = paths[0]
  if (typeof sdk !== 'string' || paths.some(path => path !== sdk)) {
    Errors.ThrowUserInput('Configure matching editor TypeScript SDK paths in .vscode/settings.json.')
  }
  if (settings['js/ts.experimental.useTsgo'] === true || settings['typescript.experimental.useTsgo'] === true) {
    Errors.ThrowUserInput('Disable experimental TypeScript Native Preview to match the compiler used by check.')
  }
  const version = sdkVersion(sdk)
  if (version !== TypeScript.version) {
    Errors.ThrowUserInput(`Editor TypeScript ${version} differs from check (${TypeScript.version}).`)
  }
}

function sdkVersion(sdk: string): string {
  const directory = Repo.resolvePath(sdk)
  if (!FileSystem.existsSync(Path.join(directory, 'tsserver.js'))) {
    Errors.ThrowUserInput(`Editor TypeScript SDK is missing: ${sdk}. Run ./agent setup or correct the SDK path.`)
  }
  return JSON.parse(FileSystem.readFileSync(Path.join(directory, '../package.json'), 'utf8')).version
}
