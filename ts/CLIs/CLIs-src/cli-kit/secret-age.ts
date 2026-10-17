import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { IO } from './cli-kit'
import type { Cipher } from './secret-store'

/** createAgeCipher adapts age to the secrets flow while keeping private keys out of argv and files. */
export function createAgeCipher(identityPath: string, artifactDirectory: string, setupCommand: string): Cipher {
  return {
    encrypt: async (plaintext, recipients) => {
      if (recipients.length === 0) {
        Errors.ThrowUserInput('The secret store has no recipients.')
      }
      const result = await run(
        'age --armor',
        recipients.flatMap(recipient => ['--recipient', recipient]),
        plaintext,
      )
      return result
    },
    decrypt: async armor => {
      if (!FileSystem.existsSync(identityPath)) {
        Errors.ThrowHostEnvironment(`No secrets identity at ${identityPath}. Run ${setupCommand} on this machine.`)
      }
      IO.stderr(
        'Unlocking the secret store. On macOS, Secure Enclave authorization may open a Touch ID or login dialog.\n',
      )
      const result = await run('age --decrypt --identity', [identityPath], armor)
      return result
    },
    decryptWithKey: async (armor, secretKey) => {
      const directory = Path.join(artifactDirectory, '.artifacts/cache/secrets')
      await FileSystem.mkdir(directory, { recursive: true })
      const temporary = await FileSystem.mkdtemp(Path.join(directory, 'ciphertext-'))
      const path = Path.join(temporary, 'value.age')
      return await Try(async () => {
        await FileSystem.write(path, armor)
        const result = await run('age --decrypt --identity -', [path], secretKey)
        return result
      }, { finally: () => FileSystem.rm(temporary, { force: true, recursive: true }) })
    },
    generateKey: async () => {
      const result = await run('age-keygen', [])
      const recipient = /^#\s*public key:\s*(age1\S+)\s*$/m.exec(result)?.[1]
      const secretKey = /^AGE-SECRET-KEY-1\S+$/m.exec(result)?.[0]
      if (recipient === undefined || secretKey === undefined) {
        Errors.ThrowHostEnvironment('age-keygen did not return a valid key pair.')
      }
      return { recipient, secretKey }
    },
    recipientOfKey: async secretKey => {
      const result = await run('age-keygen -y', [], secretKey)
      const recipient = result.trim()
      if (!recipient.startsWith('age1')) {
        Errors.ThrowHostEnvironment('age-keygen did not return a valid recipient.')
      }
      return recipient
    },
  }
}

async function run(command: string, variadicArgs: readonly string[], stdin?: string): Promise<string> {
  const child = Platform.spawn([...command.split(' '), ...variadicArgs], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (stdin !== undefined) {
    child.stdin.write(stdin)
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
