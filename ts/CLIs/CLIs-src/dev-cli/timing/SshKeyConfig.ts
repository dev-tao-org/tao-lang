import { Errors, NewlineCharacter, S, Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'

/** installSshConfig makes the dedicated key available to fresh connections through OpenSSH config. */
export async function installSshConfig(host: string, identity: string, configPath: string): Promise<void> {
  const path = await resolveConfigPath(configPath)
  const original = await readConfig(path)
  const updated = withSshKeyEntry(original, host, identity)
  if (updated === original) {
    return
  }
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FS.writeFile(pending, updated, { flag: 'wx', mode: 0o600 })
    await Exec.capture('/usr/bin/ssh', ['-G', '-F', pending, '--', host])
    UserInput.Require(
      await readConfig(path) === original,
      'SSH config changed during setup. Run ssh-key-setup again to preserve those edits.',
    )
    await FS.rename(pending, path)
  }, { finally: () => FS.rm(pending, { force: true }) })
}

function withSshKeyEntry(config: string, host: string, identity: string): string {
  const file = Path.basename(identity)
  const begin = `# Tao SSH key ${file}`
  const end = `# End Tao SSH key ${file}`
  const entry = S`
    ${begin}
    ${matchHost(host)}
      IdentityFile ~/.ssh/${file}
      UseKeychain yes
    Host *
    ${end}
  ` + NewlineCharacter
  const start = config.indexOf(begin + NewlineCharacter)
  if (start < 0) {
    return appendEntry(config, entry)
  }
  const endPosition = config.indexOf(end + NewlineCharacter, start)
  UserInput.Require(
    !(endPosition < 0),
    'The Tao SSH config entry is incomplete. Restore its end marker before rerunning setup.',
  )
  const original = config.slice(0, start) + config.slice(endPosition + end.length + NewlineCharacter.length)
  return appendEntry(original, entry)
}

function appendEntry(config: string, entry: string): string {
  const separator = config && !config.endsWith(NewlineCharacter) ? NewlineCharacter : ''
  return config + separator + entry
}

function matchHost(host: string): string {
  const separator = host.indexOf('@')
  if (separator < 0) {
    return `Host ${host}`
  }
  const user = host.slice(0, separator)
  const hostname = host.slice(separator + 1)
  return `Match originalhost ${hostname} user ${user}`
}

async function resolveConfigPath(path: string): Promise<string> {
  return await Try(() => FS.realpath(path), {
    catch(error) {
      if (isMissing(error)) {
        return path
      }
      return Errors.Throw(error)
    },
  })
}

async function readConfig(path: string): Promise<string> {
  return await Try(() => FS.readFile(path, 'utf8'), {
    catch(error) {
      if (isMissing(error)) {
        return ''
      }
      return Errors.Throw(error)
    },
  })
}

function isMissing(error: unknown): boolean {
  return Errors.isNativeError(error) && 'code' in error && error.code === 'ENOENT'
}
