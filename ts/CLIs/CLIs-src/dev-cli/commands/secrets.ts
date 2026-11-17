import { IO } from '@cli-kit'
import { Errors, NewlineCharacter, Regxs, Sort, Time, Try, UserInput } from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { createAgeCipher } from '../../cli-kit/secret-age'
import * as SecretStoreModule2 from '../../cli-kit/secret-store'
import { registerCommand } from './_command-runner'

/** secretsCommand manages the committed encrypted store and its generated local environment file. */
export default registerCommand({
  name: 'secrets',
  description: 'Decrypt or manage encrypted repository secrets.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => await runSecrets(args, liveEnvironment()),
})

const storePath = Repo.resolvePath('.secrets', 'secrets.jsonc')
const envPath = Repo.resolvePath('.env.secrets')
const lockPath = Artifacts.resolvePath('cache', 'secrets', 'locks', 'store-lock')

type SecretsEnvironment = {
  cipher: SecretStoreModule2.Cipher
  promptSecret: (prompt: string) => Promise<string>
  now: () => Date
}

async function runSecrets(args: readonly string[], environment: SecretsEnvironment): Promise<void> {
  const [action, ...rest] = args
  if (action === undefined) {
    await decryptSecrets(environment)
  } else if (action === 'add') {
    const name = rest[0]
    UserInput.require(name !== undefined, 'Name the secret to add, as in ./dev secrets add ANTHROPIC_API_KEY.')
    await addSecret(name, rest.slice(1).join(' ') || undefined, environment)
  } else if (action === 'list') {
    await listSecrets()
  } else if (action === 'setup') {
    await setupSecrets()
  } else {
    UserInput.fail(`Unknown secrets action '${action}'. Use no action to decrypt, or add, list, or setup.`)
  }
}

function liveEnvironment(): SecretsEnvironment {
  return {
    cipher: createAgeCipher(secretsIdentityPath(), './dev secrets setup'),
    now: Time.date,
    async promptSecret(prompt) {
      const value = await IO.askSecret(prompt)
      if (value === value.trim()) {
        return value
      }
      IO.warn('The value has surrounding whitespace.')
      const answer = await IO.askSecret('Remove surrounding whitespace before storing? [Y/n]: ')
      return Regxs.NegativeConfirmationRegx.test(answer.trim()) ? value : value.trim()
    },
  }
}

type OptionalSecretDescription = string | undefined

async function addSecret(
  name: string,
  note: OptionalSecretDescription,
  environment: SecretsEnvironment,
): Promise<void> {
  SecretStoreModule2.requireSecretName(name)
  const original = await readStore()
  UserInput.require(
    original.recipients.length !== 0,
    'The secret store lists no recipients. Run ./dev secrets setup first.',
  )
  const key = original.storeKey === undefined
    ? await createStoreKey(environment.cipher, original.recipients)
    : original.storeKey
  if (original.storeKey !== undefined) {
    await SecretStoreModule2.unlockSecretStoreKey(environment.cipher, original.storeKey)
  }
  IO.print(`Enter the exact value for ${name} in the hidden prompt. It will not be echoed.`)
  const value = await environment.promptSecret(`Value for ${name}:`)
  UserInput.require(value.trim() !== '', 'No value was entered, so nothing was stored.')
  const armor = await environment.cipher.encrypt(value, [key.recipient])
  await withStoreMutation(async () => {
    const current = await readStore()
    UserInput.require(
      !hasConflictingSecretChange(original, current, name),
      'The recipients, store key, or selected secret changed while adding. Run the command again.',
    )
    const updated = SecretStoreModule2.withSecret({ ...current, storeKey: current.storeKey ?? key }, name, armor, {
      now: environment.now(),
      ...(note === undefined ? {} : { note }),
    })
    await writeStore(updated)
  })
  IO.print(`${original.secrets[name] === undefined ? 'Added' : 'Replaced'} ${name} in .secrets/secrets.jsonc.`)
  IO.print('Run ./dev secrets to write it into .env.secrets.')
}

function hasConflictingSecretChange(
  original: SecretStoreModule2.SecretStore,
  current: SecretStoreModule2.SecretStore,
  name: string,
): boolean {
  return haveSecretRecipientsChanged(original, current)
    || SecretStoreModule2.encodeSecretEntry(current.secrets[name])
      !== SecretStoreModule2.encodeSecretEntry(original.secrets[name])
    || current.storeKey?.recipient !== original.storeKey?.recipient
}

async function createStoreKey(
  cipher: SecretStoreModule2.Cipher,
  recipients: readonly string[],
): Promise<SecretStoreModule2.StoreKey> {
  const key = await cipher.generateKey()
  return {
    recipient: key.recipient,
    wrappedFor: [...recipients],
    wrappedKey: armorLines(await cipher.encrypt(key.secretKey, recipients)),
  }
}

async function decryptSecrets(environment: SecretsEnvironment): Promise<void> {
  const original = await readStore()
  const names = Object.keys(original.secrets).sort(Sort.CompareStrings)
  if (names.length === 0) {
    IO.print('No secrets are stored yet. Add one with ./dev secrets add <KEY>.')
    return
  }
  const storeKey = original.storeKey!
  const { values, secretKey } = await SecretStoreModule2.decryptSecretValues(original, environment.cipher)
  await writeGeneratedEnv(SecretStoreModule2.renderSecretEnvFile(values, environment.now()))
  IO.print(`Wrote ${values.size} ${values.size === 1 ? 'secret' : 'secrets'} to .env.secrets.`)
  const ungranted = original.recipients.filter(recipient => !storeKey.wrappedFor.includes(recipient))
  if (ungranted.length > 0) {
    await grantStoreKey(original, secretKey, environment.cipher)
  }
}

async function writeGeneratedEnv(contents: string): Promise<void> {
  const directory = Artifacts.resolvePath('cache', 'secrets')
  await Artifacts.mkdir(directory)
  const temporaryDirectory = await Artifacts.mkdtemp(Path.join(directory, 'env-'))
  const temporary = Path.join(temporaryDirectory, 'secrets.env')
  await Try(async () => {
    await Artifacts.writePrivate(temporary, contents)
    await Artifacts.move(temporary, envPath)
  }, {
    finally: () => Artifacts.rm(temporaryDirectory, { recursive: true, force: true }),
  })
}

async function grantStoreKey(
  original: SecretStoreModule2.SecretStore,
  secretKey: string,
  cipher: SecretStoreModule2.Cipher,
): Promise<void> {
  const storeKey = original.storeKey!
  const wrappedKey = armorLines(await cipher.encrypt(secretKey, original.recipients))
  await withStoreMutation(async () => {
    const current = await readStore()
    if (hasConflictingGrantChange(original, current, storeKey)) {
      IO.warn('Recipients changed while decrypting; run secrets again to grant the current recipients access.')
      return
    }
    await writeStore({ ...current, storeKey: { ...storeKey, wrappedFor: [...current.recipients], wrappedKey } })
  })
}

function hasConflictingGrantChange(
  original: SecretStoreModule2.SecretStore,
  current: SecretStoreModule2.SecretStore,
  expectedStoreKey: SecretStoreModule2.StoreKey,
): boolean {
  if (haveSecretRecipientsChanged(original, current)) {
    return true
  }
  const currentKey = SecretStoreModule2.encodeStoreKey(current.storeKey)
  const expectedKey = SecretStoreModule2.encodeStoreKey(expectedStoreKey)
  return currentKey !== expectedKey
}

function haveSecretRecipientsChanged(
  original: SecretStoreModule2.SecretStore,
  current: SecretStoreModule2.SecretStore,
): boolean {
  const currentRecipients = SecretStoreModule2.encodeSecretRecipients(current.recipients)
  const originalRecipients = SecretStoreModule2.encodeSecretRecipients(original.recipients)
  return currentRecipients !== originalRecipients
}

function armorLines(armor: string): string[] {
  return armor.trimEnd().split(NewlineCharacter)
}

async function listSecrets(): Promise<void> {
  const store = await readStore()
  const names = Object.keys(store.secrets).sort(Sort.CompareStrings)
  if (names.length === 0) {
    IO.print('No secrets are stored yet.')
    return
  }
  IO.print(`${names.length} ${names.length === 1 ? 'secret' : 'secrets'} in .secrets/secrets.jsonc:`)
  for (const name of names) {
    const entry = store.secrets[name]!
    const date = (entry.updatedAt ?? entry.addedAt).slice(0, 10)
    IO.print(`  ${name.padEnd(28)} ${date}${entry.note === undefined ? '' : `  ${entry.note}`}`)
  }
}

async function setupSecrets(): Promise<void> {
  UserInput.require(
    Platform.systemInfo().os === 'Darwin',
    'Secure Enclave secrets setup requires macOS with age-plugin-se.',
  )
  const identityPath = secretsIdentityPath()
  await FS.mkdir(Path.dirname(identityPath))
  const existed = FS.existsSync(identityPath)
  if (!existed) {
    await runIdentityTool(['keygen', '--access-control', 'any-biometry-or-passcode', '--output', identityPath])
  }
  await FS.chmod(identityPath, 0o600)
  const recipient = await recipientOfIdentity()
  const added = await withStoreMutation(async () => {
    const store = await readStore()
    if (store.recipients.includes(recipient)) {
      return false
    }
    await writeStore({ ...store, recipients: [...store.recipients, recipient] })
    return true
  })
  IO.print(buildRecipientIdentityMessage(added, existed))
}

function buildRecipientIdentityMessage(added: boolean, existed: boolean): string {
  if (!added) {
    return 'This machine is already a secrets recipient.'
  }
  if (existed) {
    return "Recorded this machine's existing Secure Enclave identity as a secrets recipient."
  }
  return 'Created a Secure Enclave identity and recorded this machine as a secrets recipient.'
}

async function readStore(): Promise<SecretStoreModule2.SecretStore> {
  if (!FS.existsSync(storePath)) {
    return { recipients: [], secrets: {} }
  }
  return SecretStoreModule2.parseSecretStore(await FS.file(storePath).text())
}

async function writeStore(store: SecretStoreModule2.SecretStore): Promise<void> {
  await FS.mkdir(Path.dirname(storePath))
  const directory = Artifacts.resolvePath('cache', 'secrets')
  await Artifacts.mkdir(directory)
  const temporary = Path.join(directory, `${Platform.randomUUID()}.tmp`)
  await Try(async () => {
    await Artifacts.write(temporary, SecretStoreModule2.formatSecretStore(store))
    await Artifacts.move(temporary, storePath)
  }, {
    finally: () => Artifacts.rm(temporary, { force: true }),
  })
}

async function withStoreMutation<Value>(work: () => Promise<Value>): Promise<Value> {
  await Artifacts.mkdir(Path.dirname(lockPath))
  const deadline = Time.nowMs() + 30_000
  while (true) {
    const acquired = await Try(async () => {
      await Artifacts.createExclusiveDirectory(lockPath)
      return true
    }, {
      catch(error) {
        if (!isAlreadyExists(error)) {
          Errors.Throw(error)
        }
        return false
      },
    })
    if (acquired) {
      return await Try(work, {
        finally: () => Artifacts.rm(lockPath, { recursive: true, force: true }),
      })
    }
    if (Time.nowMs() >= deadline) {
      Errors.ThrowHostEnvironment('Timed out waiting for the repository secrets lock.')
    }
    await Time.sleep(25)
  }
}

function isAlreadyExists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'EEXIST'
}

async function recipientOfIdentity(): Promise<string> {
  const identityPath = secretsIdentityPath()
  const contents = await FS.file(identityPath).text()
  const recorded = Regxs.PublicKeyCommentRegx.exec(contents)?.[1]
  if (recorded !== undefined) {
    return recorded
  }
  const recipient = await runIdentityTool(['recipients', '--input', identityPath])
  if (recipient.trim() === '') {
    Errors.ThrowHostEnvironment('age-plugin-se did not return the identity recipient.')
  }
  return recipient.trim()
}

async function runIdentityTool(args: readonly string[]): Promise<string> {
  const result = await Exec.capture('age-plugin-se', args, { check: false })
  if (result.status !== 0 || result.signal !== null) {
    Errors.ThrowHostEnvironment(`age-plugin-se failed during identity setup (exit ${result.status}).`)
  }
  return result.stdout
}

function secretsIdentityPath(): string {
  return Path.home('.config', 'tao', 'secrets-identity.txt')
}
