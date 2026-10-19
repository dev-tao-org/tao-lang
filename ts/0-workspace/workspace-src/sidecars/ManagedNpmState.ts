import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'

/** ensureOwnedFile checks generated state and rewrites it only during explicit repair. */
export async function ensureOwnedFile(path: string, contents: string, repair: boolean): Promise<void> {
  const current = await optionalText(path)
  if (current !== undefined && current !== contents && !repair) {
    Errors.ThrowUserInput(`Managed npm metadata drifted. Repair with: tao prepare --repair.`)
  }
  if (current !== contents) {
    await writeReadOnly(path, contents)
  }
}

/** readOwnedMetadata tolerates damaged generated metadata only when its durable lock proves ownership. */
export async function readOwnedMetadata(
  profile: string,
  fingerprint: string,
  repair: boolean,
  durableLock: string | undefined,
): Promise<Record<string, unknown> | undefined> {
  const path = Path.join(profile, '.tao-managed.json')
  const text = await optionalText(path)
  if (text === undefined || !repair) {
    return await optionalJson(path)
  }
  const parsed = await Try.WithDefault(undefined, () => JSON.parse(text) as Record<string, unknown>)
  if (parsed?.fingerprint === fingerprint && typeof parsed.lockHash === 'string') {
    return parsed
  }
  if (durableLock === undefined) {
    Errors.ThrowUserInput(`Managed npm metadata ownership cannot be verified for ${profile}.`)
  }
  return { fingerprint, lockHash: Platform.hashText(durableLock) }
}

/** optionalText reads an owned state file after rejecting symbolic links. */
export async function optionalText(path: string): Promise<string | undefined> {
  if (FileSystem.existsSync(path) && FileSystem.lstatSync(path).isSymbolicLink()) {
    Errors.ThrowUserInput(`Managed npm path cannot be a symbolic link: ${path}`)
  }
  return await FileSystem.exists(path) ? await FileSystem.readFile(path, 'utf8') : undefined
}

/** optionalJson parses an optional generated state file with a Tao diagnostic on malformed content. */
export async function optionalJson(path: string): Promise<Record<string, unknown> | undefined> {
  const text = await optionalText(path)
  if (text === undefined) {
    return undefined
  }
  return await Try(() => JSON.parse(text) as Record<string, unknown>, {
    catch: () => Errors.ThrowUserInput(`Managed npm state is invalid at ${path}.`),
  })
}

/** writeReadOnly writes generated state and restores its read-only permissions. */
export async function writeReadOnly(path: string, contents: string): Promise<void> {
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  if (await FileSystem.exists(path)) {
    if (await FileSystem.readFile(path, 'utf8') !== contents) {
      await Files.withWritableFile(path, file => file.write(contents))
    }
  } else {
    await FileSystem.writeFile(path, contents)
  }
  await FileSystem.chmod(path, 0o444)
}
