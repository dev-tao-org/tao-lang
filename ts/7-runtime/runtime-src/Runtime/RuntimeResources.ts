/** RuntimeSourceDirectories declares portable source folders and their resource destinations. */
export const RuntimeSourceDirectories = {
  'runtime': 'ts/7-runtime/runtime-src/client',
  'shared/universal': 'ts/shared/shared-src/universal',
  'shared/os/preview': 'ts/shared/shared-src/os/preview',
  'shared/os/bridges/Bridge_browser': 'ts/shared/shared-src/os/bridges/Bridge_browser',
} as const

/** RuntimeSourceFiles declares individual portable source files outside those folders. */
export const RuntimeSourceFiles = {
  'runtime/Bridge_expo.ts': 'ts/7-runtime/runtime-src/bridges/Bridge_expo/Bridge_expo.ts',
  'shared/shared.ts': 'ts/shared/shared-src/shared.ts',
  'shared/bridges/Bridge_zod.ts': 'ts/shared/shared-src/bridges/Bridge_zod.ts',
} as const
