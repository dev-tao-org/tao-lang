import { nativePath as NativePath } from './bridges/Bridge_node/Bridge_node'

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

/** isWithin checks lexical containment after resolving paths with the selected platform rules. */
export function isWithin(root: string, path: string, platform = NativePath): boolean {
  const relative = platform.relative(platform.resolve(root), platform.resolve(path))
  const normalized = relative.replaceAll('\\', '/')
  return normalized !== '..' && !normalized.startsWith('../') && !platform.isAbsolute(relative)
}
