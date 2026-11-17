import * as Runtime from '@runtime'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { prepareBuildTypeScript } from '../workspace-src/BuildTypeScript'

Tests.test('generated build files resolve runtime aliases and JSX packages in their own TypeScript project', async () => {
  const root = Artifacts.resolvePath('tmp', `build-typescript-${Platform.randomUUID()}`)
  await Try(async () => {
    const runtime = await Runtime.create({
      directory: Path.join(root, 'runtime'),
      dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
    })
    const build = Path.join(root, 'build')
    await prepareBuildTypeScript(build, runtime)
    const source = Path.join(build, 'App.tsx')
    await FS.writeFile(source, 'export {}')
    const configPath = Path.join(build, 'tsconfig.json')
    const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
    Tests.expect(config.error).toBeUndefined()
    Tests.expect(config.config.extends).toBeUndefined()
    Tests.expect(config.config.compilerOptions.module).toBe('ESNext')
    const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, build)
    Tests.expect(parsed.errors).toEqual([])
    Tests.expect(parsed.fileNames).toContain(source)
    for (
      const name of ['@tao/runtime/generated', '@tao/runtime/runtime-api', '@shared', 'react', 'react/jsx-runtime']
    ) {
      const resolved = TypeScript.resolveModuleName(name, source, parsed.options, TypeScript.sys)
      Tests.expect(resolved.resolvedModule).toBeDefined()
    }
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
