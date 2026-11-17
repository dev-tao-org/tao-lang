import { Errors, Objects, Regxs } from '../../universal/universal'
import { sep } from '../bridges/Bridge_node/Bridge_node'
import type { FileOperations, GeneratedReaderOptions, GeneratedSnapshot } from './GeneratedFileSystem'

/** installGeneratedReaders routes reads and descriptors without native or synthetic generated watchers. */
export function installGeneratedReaders(options: GeneratedReaderOptions): () => void {
  const descriptors = new Map<number, { owner: GeneratedSnapshot; descriptor: number }>()
  installPathReaders(options, descriptors)
  installPromiseReaders(options)
  installDescriptors(options, descriptors)
  installStreams(options)
  options.fs.watch = (path, ...args) => {
    const normalized = options.normalize(path)
    const ancestor = normalized !== undefined && options.root.startsWith(normalized + sep)
    if (options.owns(path) || ancestor) {
      unsupported('watch')
    }
    return options.original.watch(path, ...args)
  }
  return () => {
    restoreFunctions(options.fs, options.original)
    restoreFunctions(options.promises, options.originalPromises)
  }
}

type DescriptorOwners = Map<number, { owner: GeneratedSnapshot; descriptor: number }>

const generatedDescriptorBase = 1_000_000
const readers = new Set(['access', 'exists', 'lstat', 'stat', 'readFile', 'readdir', 'readlink', 'realpath', 'opendir'])
const descriptorOperations = ['read', 'readSync', 'readv', 'readvSync', 'fstat', 'fstatSync', 'close', 'closeSync']
const streams = new Set(['createReadStream', 'ReadStream', 'FileReadStream'])
const destinationPaths = new Set(['rename', 'link', 'symlink', 'copyFile', 'cp'])

function restoreFunctions(target: FileOperations, original: FileOperations): void {
  for (const [name, value] of Object.entries(original)) {
    if (typeof value === 'function' && target[name] !== value) {
      target[name] = value
    }
  }
}

function installPathReaders(options: GeneratedReaderOptions, descriptors: DescriptorOwners): void {
  for (const [name, original] of Object.entries(options.original)) {
    if (!isPathReader(name, original)) {
      continue
    }
    const base = name.endsWith('Sync') ? name.slice(0, -4) : name
    if (readers.has(base)) {
      options.fs[name] = (value, ...args) => {
        const descriptor = typeof value === 'number' ? descriptors.get(value) : undefined
        if (descriptor) {
          return invoke(descriptor.owner, name, descriptor.descriptor, ...args)
        }
        if (!options.owns(value)) {
          return original(value, ...args)
        }
        return invoke(options.current(), name, options.normalize(value), ...args)
      }
      if (base === 'realpath') {
        Object.assign(options.fs[name], { native: options.fs[name] })
      }
    } else if (!streams.has(name)) {
      options.fs[name] = (...args) => {
        if (targetsGeneratedPath(options, base, args)) {
          unsupported(name)
        }
        return original(...args)
      }
    } else {
      // Read streams install dedicated revision-preserving routing below.
    }
  }
}

function installPromiseReaders(options: GeneratedReaderOptions): void {
  for (const [name, original] of Object.entries(options.originalPromises)) {
    if (typeof original !== 'function') {
      continue
    }
    options.promises[name] = (value, ...args) => {
      if (!options.owns(value)) {
        if (!readers.has(name) && targetsGeneratedPath(options, name, [value, ...args])) {
          unsupported(`promises.${name}`)
        }
        return original(value, ...args)
      }
      if (!readers.has(name) && name !== 'open') {
        unsupported(`promises.${name}`)
      }
      if (name === 'open') {
        assertReadOnly(args[0])
      }
      const api = options.current().promises as unknown as FileOperations
      return api[name](options.normalize(value), ...args)
    }
  }
}

function installDescriptors(options: GeneratedReaderOptions, descriptors: DescriptorOwners): void {
  let nextDescriptor = generatedDescriptorBase
  const retainDescriptor = (owner: GeneratedSnapshot, descriptor: number) => {
    const exposed = nextDescriptor++
    descriptors.set(exposed, { owner, descriptor })
    return exposed
  }
  options.fs.openSync = (path, flags, ...args) => {
    if (!options.owns(path)) {
      return options.original.openSync(path, flags, ...args)
    }
    assertReadOnly(flags)
    const owner = options.current()
    const descriptor = invoke(owner, 'openSync', options.normalize(path), flags, ...args) as number
    return retainDescriptor(owner, descriptor)
  }
  options.fs.open = (path, flags, ...args) => {
    if (!options.owns(path)) {
      return options.original.open(path, flags, ...args)
    }
    assertReadOnly(flags)
    const callback = args.pop() as (error: unknown, descriptor?: number) => void
    const owner = options.current()
    return invoke(
      owner,
      'open',
      options.normalize(path),
      flags,
      ...args,
      (error: unknown, descriptor: number) =>
        error ? callback(error) : callback(null, retainDescriptor(owner, descriptor)),
    )
  }
  for (const name of descriptorOperations) {
    options.fs[name] = (value, ...args) => {
      const descriptor = typeof value === 'number' ? descriptors.get(value) : undefined
      if (!descriptor) {
        return options.original[name](value, ...args)
      }
      if (name.startsWith('close')) {
        descriptors.delete(value as number)
      }
      return invoke(descriptor.owner, name, descriptor.descriptor, ...args)
    }
  }
}

function isPathReader(
  name: string,
  operation: FileOperations[string],
): operation is NonNullable<FileOperations[string]> {
  if (typeof operation !== 'function') {
    return false
  }
  const isLowercaseOperation = Regxs.LowercaseOperationNameRegx.test(name)
  return isLowercaseOperation && name !== 'open' && name !== 'openSync'
}

function installStreams(options: GeneratedReaderOptions): void {
  options.fs.createReadStream = (path, configuration) => {
    const configured = readStreamConfiguration(options, path, configuration)
    return options.original.createReadStream(path, configured)
  }
  for (const name of ['ReadStream', 'FileReadStream']) {
    const original = options.original[name]
    const constructor = function(this: unknown, path: unknown, configuration: unknown) {
      if (options.owns(path) && isOriginalStreamInstance(this, original)) {
        // graceful-fs supplies its own open method; generated streams must open through the captured snapshot.
        Object.defineProperty(this, 'open', { value: original.prototype.open, configurable: true, writable: true })
      }
      const configured = readStreamConfiguration(options, path, configuration)
      return original.call(this, path, configured)
    }
    options.fs[name] = Object.assign(constructor, { prototype: original.prototype })
  }
}

function readStreamConfiguration(options: GeneratedReaderOptions, path: unknown, configuration: unknown): unknown {
  if (!options.owns(path)) {
    return configuration
  }
  if (hasStreamDescriptor(configuration)) {
    unsupported('stream descriptor')
  }
  const encoding = typeof configuration === 'string' ? { encoding: configuration } : configuration
  return { ...encoding as object, fs: options.current() }
}

function hasStreamDescriptor(configuration: unknown): boolean {
  return Objects.isObject(configuration) && 'fd' in configuration
}

function isOriginalStreamInstance(value: unknown, original: FileOperations[string]): boolean {
  return value instanceof original
}

function assertReadOnly(flags: unknown): void {
  if (flags !== 'r' && flags !== 0) {
    unsupported('writable descriptor')
  }
}

function invoke(owner: GeneratedSnapshot, name: string, ...args: unknown[]): unknown {
  const operation: unknown = Reflect.get(owner, name)
  if (typeof operation !== 'function') {
    unsupported(name)
  }
  return operation.apply(owner, args)
}

function unsupported(operation: string): never {
  return Errors.ThrowHostEnvironment(`Unsupported generated filesystem operation: ${operation}`)
}

function targetsGeneratedPath(options: GeneratedReaderOptions, name: string, args: unknown[]): boolean {
  const first = args[0]
  if (Array.isArray(first) ? first.some(options.owns) : options.owns(first)) {
    return true
  }
  if (destinationPaths.has(name)) {
    return options.owns(args[1])
  }
  const configuration = args[1]
  if (name !== 'glob' || typeof configuration !== 'object' || configuration === null) {
    return false
  }
  return hasDirectoryConfiguration(configuration) && options.owns(configuration.cwd)
}

function hasDirectoryConfiguration(configuration: object): configuration is { cwd: unknown } {
  return 'cwd' in configuration
}
