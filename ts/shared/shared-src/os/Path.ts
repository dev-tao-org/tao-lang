import Env from './Env'
import { homedir, nativePath as NativePath } from './NodeBuiltins'

export {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from './NodeBuiltins'
export { fileURLToPath, pathToFileURL } from './NodeBuiltins'

/** home resolves optional segments below the host home; taoDev and tao select its Tao directories. */
export const home = Object.assign(resolveHome, { taoDev: resolveTaoDevHome, tao: resolveTaoHome })

/** toRelativeModuleSpecifier makes a relative path portable and explicit for module/config resolution. */
export function toRelativeModuleSpecifier(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return normalized
  }
  return `./${normalized}`
}

/** isWithin checks lexical containment after resolving paths with the selected platform rules. */
export function isWithin(root: string, path: string, platform = NativePath): boolean {
  const relative = platform.relative(platform.resolve(root), platform.resolve(path))
  const normalized = relative.replaceAll('\\', '/')
  return normalized !== '..' && !normalized.startsWith('../') && !platform.isAbsolute(relative)
}

function resolveHome(...paths: string[]): string {
  const homeVariable = NativePath.sep === '\\' ? 'USERPROFILE' : 'HOME'
  return NativePath.resolve(Env.get(homeVariable) || homedir(), ...paths)
}

function resolveTaoDevHome(...paths: string[]): string {
  return resolveHome('.tao-dev', ...paths)
}

function resolveTaoHome(...paths: string[]): string {
  return resolveHome('.tao', ...paths)
}
