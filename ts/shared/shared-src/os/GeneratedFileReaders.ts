import { Errors } from '../universal/universal'
import type { FileOperations, GeneratedReaderOptions, GeneratedSnapshot } from './GeneratedFileSystem'
import { sep } from './NodeBuiltins'

/** installGeneratedReaders routes reads and descriptors without native or synthetic generated watchers. */
export function installGeneratedReaders(options: GeneratedReaderOptions): () => void {
  const descriptors = new Map<number, { owner: GeneratedSnapshot; descriptor: number }>()
  installPathReaders(options, descriptors)
  installPromiseReaders(options)
  installDescriptors(options, descriptors)
  installStreams(options)
  options.fs.watch = (path, ...arguments_) => {
    const normalized = options.normalize(path)
    const ancestor = normalized !== undefined && options.root.startsWith(normalized + sep)
    if (options.owns(path) || ancestor) {
      unsupported('watch')
    }
    return options.original.watch(path, ...arguments_)
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
      options.fs[name] = (value, ...arguments_) => {
        const descriptor = typeof value === 'number' ? descriptors.get(value) : undefined
        if (descriptor) {
          return invoke(descriptor.owner, name, descriptor.descriptor, ...arguments_)
        }
        if (!options.owns(value)) {
          return original(value, ...arguments_)
        }
        return invoke(options.current(), name, options.normalize(value), ...arguments_)
      }
      if (base === 'realpath') {
        Object.assign(options.fs[name], { native: options.fs[name] })
      }
    } else if (!streams.has(name)) {
      options.fs[name] = (...arguments_) => {
        if (targetsGeneratedPath(options, base, arguments_)) {
          unsupported(name)
        }
        return original(...arguments_)
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
    options.promises[name] = (value, ...arguments_) => {
      if (!options.owns(value)) {
        if (!readers.has(name) && targetsGeneratedPath(options, name, [value, ...arguments_])) {
          unsupported(`promises.${name}`)
        }
        return original(value, ...arguments_)
      }
      if (!readers.has(name) && name !== 'open') {
        unsupported(`promises.${name}`)
      }
      if (name === 'open') {
        assertReadOnly(arguments_[0])
      }
      const api = options.current().promises as unknown as FileOperations
      return api[name](options.normalize(value), ...arguments_)
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
  options.fs.openSync = (path, flags, ...arguments_) => {
    if (!options.owns(path)) {
      return options.original.openSync(path, flags, ...arguments_)
    }
    assertReadOnly(flags)
    const owner = options.current()
    const descriptor = invoke(owner, 'openSync', options.normalize(path), flags, ...arguments_) as number
    return retainDescriptor(owner, descriptor)
  }
  options.fs.open = (path, flags, ...arguments_) => {
    if (!options.owns(path)) {
      return options.original.open(path, flags, ...arguments_)
    }
    assertReadOnly(flags)
    const callback = arguments_.pop() as (error: unknown, descriptor?: number) => void
    const owner = options.current()
    return invoke(
      owner,
      'open',
      options.normalize(path),
      flags,
      ...arguments_,
      (error: unknown, descriptor: number) =>
        error ? callback(error) : callback(null, retainDescriptor(owner, descriptor)),
    )
  }
  for (const name of descriptorOperations) {
    options.fs[name] = (value, ...arguments_) => {
      const descriptor = typeof value === 'number' ? descriptors.get(value) : undefined
      if (!descriptor) {
        return options.original[name](value, ...arguments_)
      }
      if (name.startsWith('close')) {
        descriptors.delete(value as number)
      }
      return invoke(descriptor.owner, name, descriptor.descriptor, ...arguments_)
    }
  }
}

function isPathReader(
  name: string,
  operation: FileOperations[string],
): operation is NonNullable<FileOperations[string]> {
  return typeof operation === 'function' && /^[a-z]/.test(name) && name !== 'open' && name !== 'openSync'
}

function installStreams(options: GeneratedReaderOptions): void {
  options.fs.createReadStream = (path, configuration) => {
    const configured = readStreamConfiguration(options, path, configuration)
    return options.original.createReadStream(path, configured)
  }
  for (const name of ['ReadStream', 'FileReadStream']) {
    const original = options.original[name]
    const constructor = function(this: unknown, path: unknown, configuration: unknown) {
      if (options.owns(path) && this instanceof original) {
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
  return typeof configuration === 'object' && configuration !== null && 'fd' in configuration
}

function assertReadOnly(flags: unknown): void {
  if (flags !== 'r' && flags !== 0) {
    unsupported('writable descriptor')
  }
}

function invoke(owner: GeneratedSnapshot, name: string, ...arguments_: unknown[]): unknown {
  const operation = (owner as unknown as FileOperations)[name]
  if (typeof operation !== 'function') {
    unsupported(name)
  }
  return operation.apply(owner, arguments_)
}

function unsupported(operation: string): never {
  return Errors.ThrowHostEnvironment(`Unsupported generated filesystem operation: ${operation}`)
}

function targetsGeneratedPath(options: GeneratedReaderOptions, name: string, arguments_: unknown[]): boolean {
  const first = arguments_[0]
  if (Array.isArray(first) ? first.some(options.owns) : options.owns(first)) {
    return true
  }
  if (destinationPaths.has(name)) {
    return options.owns(arguments_[1])
  }
  const configuration = arguments_[1]
  return name === 'glob' && typeof configuration === 'object' && configuration !== null && 'cwd' in configuration
    && options.owns(configuration.cwd)
}
