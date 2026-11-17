import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { Errors, Regxs, Try, UserInput } from '@shared'
import { BuildLock, FS, Path, Platform, Terminal } from '@shared/os'
import Exec from '@shared/os/exec'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { installSshConfig } from './SshKeyConfig'
import { readAuthenticatedKeyFingerprint } from './SshKeyDiagnostics'

type SshKeySetupOptions = { dryRun?: boolean }

/** setupSshKey creates or reuses a dedicated key, installs its public half, and verifies a fresh login. */
export async function setupSshKey(host: string, options: SshKeySetupOptions = {}): Promise<void> {
  requireHost(host)
  const identity = sshKeyPath(host)
  if (options.dryRun) {
    IO.print(`Would set up SSH key ${identity} for ${host}, update SSH config and verify a fresh login.`)
    return
  }
  UserInput.require(
    Platform.systemInfo().os === 'Darwin',
    'SSH key setup uses macOS Keychain. Run it on the controlling Mac.',
  )
  const directory = Path.dirname(identity)
  await FS.mkdirPrivate(directory)
  await BuildLock.withBuildLock(Path.join(directory, '.tao-ssh-setup.lock'), () => enrollKey(host, identity))
}

async function enrollKey(host: string, identity: string): Promise<void> {
  const alreadyEnrolled = await FS.exists(identity) && await probeDedicatedKey(host, identity)
  if (!alreadyEnrolled) {
    await copyKeyToHost(host, identity)
  }
  if (!alreadyEnrolled && !await probeDedicatedKey(host, identity)) {
    Errors.ThrowHostEnvironment(`A fresh SSH login to ${host} did not authenticate with the dedicated key.`)
  }
  await installSshConfig(host, identity, Path.home('.ssh', 'config'))
  await verifyKeyLogin(host)
  IO.print(`SSH is ready for ${host}. A fresh login used your saved settings without prompting.`)
}

async function copyKeyToHost(host: string, identity: string): Promise<void> {
  UserInput.require(!!Terminal.isInteractive(), 'Run just setup-ssh-key HOST in Terminal to enroll the key.')
  await prepareKey(host, identity)
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-add', ['--apple-use-keychain', identity])
  IO.print(`Installing the public key on ${host}. SSH may ask for the remote login password once.`)
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-copy-id', [
    '-f',
    '-i',
    identity + PublicKeySuffix,
    '-o',
    'ConnectTimeout=10',
    '--',
    host,
  ])
}

function sshKeyPath(host: string): string {
  const label = Platform.hashText(host).slice(0, 16)
  return Path.home('.ssh', `id_ed25519_tao_${label}`)
}

async function prepareKey(host: string, identity: string): Promise<void> {
  const publicKey = identity + PublicKeySuffix
  const privateExists = await FS.exists(identity)
  const publicExists = await FS.exists(publicKey)
  if (privateExists !== publicExists) {
    UserInput.fail(`SSH key pair is incomplete at ${identity}. Restore the missing file before retrying.`)
  }
  if (privateExists) {
    return
  }
  await FS.mkdirPrivate(Path.dirname(identity))
  IO.print('Choose a passphrase for the dedicated key. macOS Keychain can store it for later logins.')
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-keygen', ['-t', 'ed25519', '-f', identity, '-C', `tao:${host}`])
}

const PublicKeySuffix = '.pub'
const FreshLoginArgs = [
  '-S',
  'none',
  '-o',
  'BatchMode=yes',
  '-o',
  'PreferredAuthentications=publickey',
  '-o',
  'IdentityAgent=none',
  '-o',
  'ConnectTimeout=10',
] as const

async function probeDedicatedKey(host: string, identity: string): Promise<boolean> {
  const publicKey = identity + PublicKeySuffix
  if (!await FS.exists(publicKey)) {
    UserInput.fail(`SSH key pair is incomplete at ${identity}. Restore the missing file before retrying.`)
  }
  const keyInfo = await Exec.captureStdout('/usr/bin/ssh-keygen', ['-E', 'sha256', '-lf', publicKey])
  const fingerprint = keyInfo.match(Regxs.SshPublicKeyFingerprintRegx)?.[0]
  if (!fingerprint) {
    Errors.ThrowHostEnvironment(`Unable to identify the dedicated SSH key at ${publicKey}.`)
  }
  return await readDedicatedLogin(host, identity) === fingerprint
}

async function readDedicatedLogin(host: string, identity: string): Promise<string | undefined> {
  const directory = await FS.mkdtemp(Path.join(Path.dirname(identity), '.tao-ssh-probe-'))
  return await Try(async () => {
    const log = Path.join(directory, 'ssh.log')
    const args = [
      ...FreshLoginArgs,
      '-vvv',
      '-E',
      log,
      '-o',
      'FingerprintHash=sha256',
      '-o',
      'LogVerbose=none',
      '-o',
      'UseKeychain=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-i',
      identity,
      '--',
      host,
      'true',
    ]
    const result = await Exec.capture('/usr/bin/ssh', args, { check: false })
    if (result.status !== 0) {
      return undefined
    }
    return readAuthenticatedKeyFingerprint(await FS.readFile(log, 'utf8'))
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}

async function verifyKeyLogin(host: string): Promise<void> {
  const result = await Exec.capture('/usr/bin/ssh', [...FreshLoginArgs, '--', host, 'true'], { check: false })
  if (result.status !== 0) {
    Errors.ThrowHostEnvironment(`A fresh key-only SSH login to ${host} failed. ${result.stderr.trim()}`)
  }
}
