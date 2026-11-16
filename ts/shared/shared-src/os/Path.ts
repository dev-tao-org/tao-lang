import { homedir, nativePath as NativePath } from './bridges/Bridge_node/Bridge_node'
import Env from './Env'

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
} from './bridges/Bridge_node/Bridge_node'
export { fileURLToPath, pathToFileURL } from './bridges/Bridge_node/Bridge_node'

/** home resolves optional segments below the host home; taoDev and tao select its Tao directories. */
export const home = Object.assign(resolveHome, { taoDev: resolveTaoDevHome, tao: resolveTaoHome })

/** toPortablePath aligns native and slash-separated filenames for cross-platform comparison. */
export function toPortablePath(path: string): string {
  return path.replaceAll('\\', '/')
}

/** toRelativeModuleSpecifier makes a relative path portable and explicit for module/config resolution. */
export function toRelativeModuleSpecifier(path: string): string {
  const normalized = toPortablePath(path)
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return normalized
  }
  return `./${normalized}`
}

/** isWithin checks lexical containment after resolving paths with the selected platform rules. */
export function isWithin(root: string, path: string, platform = NativePath): boolean {
  const relative = platform.relative(platform.resolve(root), platform.resolve(path))
  const normalized = toPortablePath(relative)
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
