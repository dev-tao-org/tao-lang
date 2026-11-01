/** RuntimeSourceDirectories declares portable source folders and their resource destinations. */
export const RuntimeSourceDirectories = {
  'runtime': 'ts/7-runtime/runtime-src/client',
  'shared/universal': 'ts/shared/shared-src/universal',
  'shared/os/preview': 'ts/shared/shared-src/os/preview',
} as const

/** RuntimeSourceFiles declares individual portable source files outside those folders. */
export const RuntimeSourceFiles = {
  'shared/shared.ts': 'ts/shared/shared-src/shared.ts',
} as const
