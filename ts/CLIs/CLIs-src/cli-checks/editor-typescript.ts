import { Json, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { TypeScript } from '@tao/shared/typescript'

/** checkEditorTypeScript verifies editor settings and the managed tsc executable against the pinned compiler. */
export async function checkEditorTypeScript(): Promise<void> {
  assertEditorTypeScript(await FS.readFile(Repo.resolvePath('.vscode/settings.json'), 'utf8'))
  const actual = await Exec.captureStdout('tsc', '--version')
  if (actual !== `Version ${TypeScript.version}`) {
    UserInput.Fail(
      `Managed tsc reports ${actual}; expected TypeScript ${TypeScript.version}. Run ./agent unsandboxed setup.`,
    )
  }
}

function assertEditorTypeScript(source: string): void {
  const parsed = TypeScript.parseConfigFileTextToJson('.vscode/settings.json', source)
  UserInput.Require(!parsed.error, 'Cannot parse .vscode/settings.json for the editor TypeScript SDK.')
  const settings = parsed.config as Record<string, unknown>
  const paths = [settings['typescript.tsdk'], settings['js/ts.tsdk.path']].filter(path => path !== undefined)
  const sdk = paths[0]
  UserInput.Require(
    !(typeof sdk !== 'string' || paths.some(path => path !== sdk)),
    'Configure matching editor TypeScript SDK paths in .vscode/settings.json.',
  )
  UserInput.Require(
    !(settings['js/ts.experimental.useTsgo'] === true || settings['typescript.experimental.useTsgo'] === true),
    'Disable experimental TypeScript Native Preview to match the compiler used by check.',
  )
  const version = sdkVersion(sdk)
  if (version !== TypeScript.version) {
    UserInput.Fail(`Editor TypeScript ${version} differs from check (${TypeScript.version}).`)
  }
}

function sdkVersion(sdk: string): string {
  const directory = Repo.resolvePath(sdk)
  if (!FS.existsSync(Path.join(directory, 'tsserver.js'))) {
    UserInput.Fail(`Editor TypeScript SDK is missing: ${sdk}. Run ./agent unsandboxed setup or correct the SDK path.`)
  }
  return parseSdkVersion(FS.readFileSync(Path.join(directory, '../package.json'), 'utf8'))
}

function parseSdkVersion(source: string): string {
  const manifest = Json.Parse(source)
  UserInput.Require(
    !(!manifest || typeof manifest !== 'object'),
    'Editor TypeScript package manifest must contain a version string.',
  )
  const version = (manifest as Record<string, unknown>).version
  UserInput.Require(typeof version === 'string', 'Editor TypeScript package manifest must contain a version string.')
  return version
}
