import { Json, NewlineCharacter } from '@shared'
import { Path } from '@shared/os'

/** serializeExpoTypeScriptConfig configures the generated Expo host. */
export function serializeExpoTypeScriptConfig(): string {
  return Json.Print({
    extends: 'expo/tsconfig.base',
    compilerOptions: { baseUrl: '.', ...runtimeCompilerOptions, paths: resolveRuntimePaths('.') },
  })
}

/** serializeAppBuildTypeScriptConfig configures generated sources for inspection and checking. */
export function serializeAppBuildTypeScriptConfig(runtimeDirectory: string): string {
  return Json.Print({
    compilerOptions: {
      ...runtimeCompilerOptions,
      paths: resolveRuntimePaths(Path.resolve(runtimeDirectory)),
      allowJs: true,
      esModuleInterop: true,
      jsx: 'react-jsx',
      lib: ['DOM', 'ESNext'],
      module: 'ESNext',
      moduleDetection: 'force',
      moduleResolution: 'Bundler',
      customConditions: ['react-native'],
      noEmit: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      target: 'ESNext',
      allowImportingTsExtensions: true,
    },
    include: ['./**/*.ts', './**/*.tsx'],
    exclude: ['./node_modules'],
  }) + NewlineCharacter
}

const runtimeCompilerOptions = {
  strict: true,
  jsxImportSource: '@runtime/client/Bridge_react',
  preserveSymlinks: true,
}

function resolveRuntimePaths(runtimeDirectory: string): Record<string, string[]> {
  const shared = Path.join(runtimeDirectory, 'src/_gen_runtime/shared')
  const runtime = Path.join(runtimeDirectory, 'src/_gen_runtime/runtime')
  const taoRuntimeApi = Path.join(runtime, 'TaoRuntimeAPI.ts')
  return {
    '@tao/runtime/generated': [Path.join(runtime, 'TR.ts')],
    '@tao/runtime/runtime-api': [taoRuntimeApi],
    '@runtime/client/*': [Path.join(runtime, '*')],
    '@tao/runtime-api': [taoRuntimeApi],
    '@shared': [Path.join(shared, 'shared.ts')],
    '@shared/os/preview': [Path.join(shared, 'os/preview/PreviewPlatform.ts')],
  }
}
