import { Errors, Json, NewlineCharacter, Regxs, S, Sort, Try, UserInput } from '@shared'
import * as Shared from '@shared'
import { Text } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { assertUniqueSecretStoreKeys } from './secret-store-jsonc'

/** unlockSecretStoreKey unwraps once with the machine identity and verifies the recorded software-key recipient. */
export async function unlockSecretStoreKey(cipher: Cipher, storeKey: StoreKey): Promise<string> {
  const secretKey = (await Try(() => cipher.decrypt(storeKey.wrappedKey.join(NewlineCharacter)), {
    catch: () => Errors.ThrowHostEnvironment('This machine identity could not unlock the secrets store.'),
  })).trim()
  UserInput.require(
    await cipher.recipientOfKey(secretKey) === storeKey.recipient,
    'The identity unwrapped a different store key. Restore the storeKey block from its last valid commit.',
  )
  return secretKey
}

/** Cipher defines the age operations used by the Tao-owned secrets workflow. */
export type Cipher = {
  encrypt: (plaintext: string, recipients: readonly string[]) => Promise<string>
  decrypt: (armor: string) => Promise<string>
  decryptWithKey: (armor: string, secretKey: string) => Promise<string>
  generateKey: () => Promise<{ recipient: string; secretKey: string }>
  recipientOfKey: (secretKey: string) => Promise<string>
}

/** StoreKey records the software key used for values and its machine-wrapped forms. */
export type StoreKey = {
  recipient: string
  wrappedFor: readonly string[]
  wrappedKey: readonly string[]
}

/** SecretStore contains machine recipients, the shared store key, and encrypted values. */
export type SecretStore = {
  recipients: readonly string[]
  storeKey?: StoreKey
  secrets: Readonly<Record<string, SecretEntry>>
}

/** encodeSecretRecipients retains recipient order for concurrent-change detection. */
export function encodeSecretRecipients(recipients: SecretStore['recipients']): string {
  return Json.Print(recipients)
}

type OptionalSecretEntry = SecretEntry | undefined
/** encodeSecretEntry retains optional absence and field order for concurrent-change detection. */
export function encodeSecretEntry(entry: OptionalSecretEntry): OptionalEncodedSecret {
  return Json.Print(entry)
}

/** encodeStoreKey retains optional absence and wrapped-key order for concurrent-change detection. */
export function encodeStoreKey(key: SecretStore['storeKey']): OptionalEncodedSecret {
  return Json.Print(key)
}

/** parseSecretStore parses JSONC and rejects shapes that could silently lose a secret. */
export function parseSecretStore(text: string): SecretStore {
  const parsed = TypeScript.parseConfigFileTextToJson('secrets.jsonc', text)
  if (parsed.error !== undefined) {
    UserInput.fail(
      `The secret store is not valid JSONC: ${
        TypeScript.flattenDiagnosticMessageText(parsed.error.messageText, NewlineCharacter)
      }`,
    )
  }
  assertUniqueSecretStoreKeys(text)
  UserInput.require(!!isRecord(parsed.config), 'The secret store must be a JSON object.')
  const recipientsValue = parsed.config.recipients
  UserInput.require(
    !(recipientsValue !== undefined && !isStringArray(recipientsValue)),
    "The secret store's recipients must be an array of strings.",
  )
  const secretsValue = parsed.config.secrets
  UserInput.require(
    !(secretsValue !== undefined && !isRecord(secretsValue)),
    "The secret store's secrets must be an object.",
  )
  const storeKey = parsed.config.storeKey === undefined ? undefined : parseStoreKey(parsed.config.storeKey)
  const secrets: Record<string, SecretEntry> = {}
  for (const [name, value] of Object.entries(isRecord(secretsValue) ? secretsValue : {})) {
    requireSecretName(name)
    if (!isRecord(value) || !isStringArray(value.value)) {
      UserInput.fail(`Secret '${name}' has no armor lines; its value must be an array of strings.`)
    }
    secrets[name] = {
      addedAt: typeof value.addedAt === 'string' ? value.addedAt : '',
      value: value.value,
      ...(typeof value.note === 'string' ? { note: value.note } : {}),
      ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    }
  }
  return {
    recipients: recipientsValue === undefined ? [] : recipientsValue,
    ...(storeKey === undefined ? {} : { storeKey }),
    secrets,
  }
}

/** formatSecretStore writes sorted two-space JSON beneath the stable explanatory header. */
export function formatSecretStore(store: SecretStore, header = secretStoreHeader): string {
  const secrets: Record<string, SecretEntry> = {}
  for (const name of Object.keys(store.secrets).sort(Sort.CompareStrings)) {
    const entry = store.secrets[name]!
    secrets[name] = {
      addedAt: entry.addedAt,
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
      value: entry.value,
    }
  }
  return `${header ? header + NewlineCharacter : ''}${
    Json.Print(
      {
        recipients: store.recipients,
        ...(store.storeKey === undefined ? {} : { storeKey: store.storeKey }),
        secrets,
      },
      { prettyPrint: true },
    )
  }${NewlineCharacter}`
}

/** withSecret adds or replaces one value while retaining its original addedAt timestamp. */
export function withSecret(
  store: SecretStore,
  name: string,
  armor: string,
  options: { now: Date; note?: string },
): SecretStore {
  const existing = store.secrets[name]
  const stamp = options.now.toISOString()
  return {
    ...store,
    secrets: {
      ...store.secrets,
      [name]: {
        addedAt: existing?.addedAt || stamp,
        value: armor.trimEnd().split(NewlineCharacter),
        ...resolveSecretNote(options.note, existing?.note),
        ...(existing === undefined ? {} : { updatedAt: stamp }),
      },
    },
  }
}

/** decryptSecretValues rejects machine-encrypted legacy entries before unwrapping or decrypting any value. */
export async function decryptSecretValues(
  store: SecretStore,
  cipher: Cipher,
): Promise<{ values: Map<string, string>; secretKey: string }> {
  const names = Object.keys(store.secrets).sort(Sort.CompareStrings)
  if (names.length === 0) {
    return { values: new Map(), secretKey: '' }
  }
  const unkeyed = names.filter(name =>
    store.storeKey === undefined
    || !isStoreKeyArmor(store.secrets[name]!.value.join(NewlineCharacter))
  )
  if (unkeyed.length > 0) {
    UserInput.fail(
      `These values are not encrypted to the store key: ${
        unkeyed.join(', ')
      }. Nothing was decrypted. Re-add them with ./dev secrets add <KEY>.`,
    )
  }
  const storeKey = store.storeKey!
  const secretKey = await unlockSecretStoreKey(cipher, storeKey)
  const values = new Map<string, string>()
  for (const name of names) {
    const value = await Try(() => cipher.decryptWithKey(store.secrets[name]!.value.join(NewlineCharacter), secretKey), {
      catch: () =>
        UserInput.fail(`${name} does not decrypt with the store key. Re-add it with ./dev secrets add ${name}.`),
    })
    values.set(name, value)
  }
  return { values, secretKey }
}

/** requireSecretName validates that a secret can become an environment variable. */
export function requireSecretName(name: string): string {
  if (!Regxs.EnvironmentVariableNameRegx.test(name)) {
    UserInput.fail(
      `'${name}' is not a usable secret name. Use capitals, digits and underscores, such as ANTHROPIC_API_KEY.`,
    )
  }
  return name
}

/** renderSecretEnvFile formats decrypted values as a generated environment file. */
export function renderSecretEnvFile(values: ReadonlyMap<string, string>, generatedAt: Date): string {
  const lines = [...values.keys()].sort(Sort.CompareStrings).map(name =>
    `${requireSecretName(name)}=${Json.Print(values.get(name)!)}`
  )
  return Shared.joinTextLines(
    `# Generated by \`./dev secrets\` at ${generatedAt.toISOString()}. Do not edit.`,
    '# tao-secret-format: json-v1',
    lines.join(NewlineCharacter),
    '',
  )
}

function isStoreKeyArmor(armor: string): boolean {
  const body = armor.split(NewlineCharacter).filter(line => !line.startsWith('-----')).join('')
  const header = Text.decodeBase64Ascii(body).split(NewlineCharacter + '--- ')[0] ?? ''
  return header.split(NewlineCharacter).some(line => line.startsWith('-> X25519 '))
}

type OptionalSecretNote = string | undefined

type OptionalEncodedSecret = string | undefined

function resolveSecretNote(note: OptionalSecretNote, existingNote: OptionalSecretNote): { note?: string } {
  if (note !== undefined) {
    return { note }
  }
  if (existingNote !== undefined) {
    return { note: existingNote }
  }
  return {}
}

type SecretEntry = {
  addedAt: string
  updatedAt?: string
  note?: string
  value: readonly string[]
}

const secretStoreHeader = S`
  // Tao's committed secrets. Values are encrypted with age; keys, notes and dates are not.
  //
  // Every value is encrypted to the store key, whose secret half is encrypted to each machine in recipients.
  // Reading or adding unwraps that key once with this machine's identity. Values encrypted directly to a
  // machine identity are refused, so a Secure Enclave identity never prompts once per value.
  //
  // Do not hand-edit a value. Use ./dev secrets add <KEY>, which encrypts what you paste and never echoes it.
`

function parseStoreKey(value: unknown): StoreKey {
  UserInput.require(
    !!isStoreKeyShape(value),
    "The secret store's storeKey needs a recipient string and wrappedFor and wrappedKey string arrays.",
  )
  return { recipient: value.recipient, wrappedFor: value.wrappedFor, wrappedKey: value.wrappedKey }
}

function isStoreKeyShape(value: unknown): value is StoreKey {
  if (!isRecord(value)) {
    return false
  }
  const hasRecipient = typeof value.recipient === 'string'
  const hasWrappedRecipients = isStringArray(value.wrappedFor)
  const hasWrappedKey = isStringArray(value.wrappedKey) && value.wrappedKey.length > 0
  return hasRecipient && hasWrappedRecipients && hasWrappedKey
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
