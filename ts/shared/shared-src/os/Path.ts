import { nativePath as NativePath } from './NodeBuiltins'

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

/** isWithin checks lexical containment after resolving paths with the selected platform rules. */
export function isWithin(root: string, path: string, platform = NativePath): boolean {
  const relative = platform.relative(platform.resolve(root), platform.resolve(path))
  const normalized = relative.replaceAll('\\', '/')
  return normalized !== '..' && !normalized.startsWith('../') && !platform.isAbsolute(relative)
}
