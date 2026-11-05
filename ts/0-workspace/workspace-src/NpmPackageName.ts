import { Regxs } from '@shared'

/** isNpmPackageName accepts npm names, including legacy mixed-case package names. */
export function isNpmPackageName(name: string): boolean {
  const parts = name.split('/')
  const scoped = parts.length === 2 && parts[0]!.startsWith('@')
  return parts.length === (scoped ? 2 : 1)
    && parts.every((part, index) => {
      const segment = scoped && index === 0 ? part.slice(1) : part
      return Regxs.PackageNameSegmentRegx.test(segment) && segment !== '.' && segment !== '..'
    })
}
