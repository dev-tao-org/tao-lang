import { Errors, Regxs, Try, UserInput } from '@shared'
import { Artifacts, FS, Path } from '@shared/os'
import Exec, { type CommandArgs } from '@shared/os/exec'
import { IO } from './cli-kit'
import type { Cipher } from './secret-store'

/** createAgeCipher adapts age to the secrets flow while keeping private keys out of argv and files. */
export function createAgeCipher(identityPath: string, setupCommand: string): Cipher {
  return {
    encrypt,
    decrypt: (armor) => decryptStoreKey(identityPath, setupCommand, armor),
    decryptWithKey,
    generateKey,
    recipientOfKey,
  }
}

async function encrypt(plaintext: string, recipients: readonly string[]): Promise<string> {
  UserInput.require(recipients.length !== 0, 'The secret store has no recipients.')
  const recipientArgs = recipients.flatMap(recipient => ['--recipient', recipient])
  return run('age', ['--armor', ...recipientArgs], plaintext)
}

async function decryptStoreKey(identityPath: string, setupCommand: string, armor: string): Promise<string> {
  if (!FS.existsSync(identityPath)) {
    Errors.ThrowHostEnvironment(
      'No secrets identity at ' + identityPath + '. Run ' + setupCommand + ' on this machine.',
    )
  }
  IO.warn('Unlocking the secret store. On macOS, Secure Enclave authorization may open a Touch ID or login dialog.')
  return run('age', ['--decrypt', '--identity', identityPath], armor)
}

async function decryptWithKey(armor: string, secretKey: string): Promise<string> {
  const directory = Artifacts.resolvePath('cache', 'secrets')
  await Artifacts.mkdir(directory)
  const temporary = await Artifacts.mkdtemp(Path.join(directory, 'ciphertext-'))
  const path = Path.join(temporary, 'value.age')
  return Try(async () => {
    await Artifacts.write(path, armor)
    return run('age', ['--decrypt', '--identity', '-', path], secretKey)
  }, {
    finally: () => Artifacts.rm(temporary, { force: true, recursive: true }),
  })
}

async function generateKey(): Promise<{ recipient: string; secretKey: string }> {
  const result = await run('age-keygen')
  const recipient = Regxs.AgePublicKeyCommentRegx.exec(result)?.[1]
  const secretKey = Regxs.AgeSecretKeyLineRegx.exec(result)?.[0]
  if (recipient === undefined || secretKey === undefined) {
    Errors.ThrowHostEnvironment('age-keygen did not return a valid key pair.')
  }
  return { recipient, secretKey }
}

async function recipientOfKey(secretKey: string): Promise<string> {
  const recipient = (await run('age-keygen', '-y', secretKey)).trim()
  if (!recipient.startsWith('age1')) {
    Errors.ThrowHostEnvironment('age-keygen did not return a valid recipient.')
  }
  return recipient
}

async function run(
  command: string,
  args: CommandArgs = [],
  stdin?: string,
): Promise<string> {
  const result = await Exec.capture(command, args, { check: false, stdin })
  if (result.status !== 0 || result.signal !== null) {
    Errors.ThrowHostEnvironment(`${command} failed while processing the secrets store (exit ${result.status}).`)
  }
  return result.stdout
}
