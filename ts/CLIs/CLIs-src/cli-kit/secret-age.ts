import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform } from '@shared/os'
import { IO } from './cli-kit'
import type { Cipher } from './secret-store'

/** createAgeCipher adapts age to the secrets flow while keeping private keys out of argv and files. */
export function createAgeCipher(identityPath: string, setupCommand: string): Cipher {
  return {
    encrypt,
    decrypt(armor) {
      return decryptStoreKey(identityPath, setupCommand, armor)
    },
    decryptWithKey,
    generateKey,
    recipientOfKey,
  }
}

async function encrypt(plaintext: string, recipients: readonly string[]): Promise<string> {
  if (recipients.length === 0) {
    Errors.ThrowUserInput('The secret store has no recipients.')
  }
  return run('age --armor', {
    variadicArgs: recipients.flatMap(recipient => ['--recipient', recipient]),
    stdin: plaintext,
  })
}

async function decryptStoreKey(identityPath: string, setupCommand: string, armor: string): Promise<string> {
  if (!FileSystem.existsSync(identityPath)) {
    Errors.ThrowHostEnvironment(
      'No secrets identity at ' + identityPath + '. Run ' + setupCommand + ' on this machine.',
    )
  }
  IO.warn('Unlocking the secret store. On macOS, Secure Enclave authorization may open a Touch ID or login dialog.')
  return run('age --decrypt --identity', { variadicArgs: [identityPath], stdin: armor })
}

async function decryptWithKey(armor: string, secretKey: string): Promise<string> {
  const directory = Artifacts.resolvePath('cache', 'secrets')
  await Artifacts.mkdir(directory, { recursive: true })
  const temporary = await Artifacts.mkdtemp(Path.join(directory, 'ciphertext-'))
  const path = Path.join(temporary, 'value.age')
  return Try(async () => {
    await Artifacts.write(path, armor)
    return run('age --decrypt --identity -', { variadicArgs: [path], stdin: secretKey })
  }, {
    finally() {
      return Artifacts.rm(temporary, { force: true, recursive: true })
    },
  })
}

async function generateKey(): Promise<{ recipient: string; secretKey: string }> {
  const result = await run('age-keygen')
  const recipient = /^#\s*public key:\s*(age1\S+)\s*$/m.exec(result)?.[1]
  const secretKey = /^AGE-SECRET-KEY-1\S+$/m.exec(result)?.[0]
  if (recipient === undefined || secretKey === undefined) {
    Errors.ThrowHostEnvironment('age-keygen did not return a valid key pair.')
  }
  return { recipient, secretKey }
}

async function recipientOfKey(secretKey: string): Promise<string> {
  const recipient = (await run('age-keygen -y', { stdin: secretKey })).trim()
  if (!recipient.startsWith('age1')) {
    Errors.ThrowHostEnvironment('age-keygen did not return a valid recipient.')
  }
  return recipient
}

async function run(
  command: string,
  options: { variadicArgs?: readonly string[]; stdin?: string } = {},
): Promise<string> {
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin)
  }
  child.stdin.end()
  const [status, stdout] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  if (status !== 0) {
    Errors.ThrowHostEnvironment(`${command} failed while processing the secrets store (exit ${status}).`)
  }
  return stdout
}
