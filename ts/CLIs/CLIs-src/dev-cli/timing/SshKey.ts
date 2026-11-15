import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { BuildLock, Exec, FS, Path, Platform, Terminal } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { installSshConfig } from './SshKeyConfig'

type SshKeySetupOptions = { dryRun?: boolean }

/** setupSshKey creates or reuses a dedicated key, installs its public half, and verifies a fresh login. */
export async function setupSshKey(host: string, options: SshKeySetupOptions = {}): Promise<void> {
  requireHost(host)
  const identity = sshKeyPath(host)
  if (options.dryRun) {
    IO.print(`Would set up SSH key ${identity} for ${host}, update SSH config and verify a fresh login.`)
    return
  }
  if (Platform.systemInfo().os !== 'Darwin') {
    Errors.ThrowUserInput('SSH key setup uses macOS Keychain. Run it on the controlling Mac.')
  }
  const directory = Path.dirname(identity)
  await FS.mkdirPrivate(directory)
  await BuildLock.withBuildLock(Path.join(directory, '.tao-ssh-setup.lock'), () => enrollKey(host, identity))
}

async function enrollKey(host: string, identity: string): Promise<void> {
  const alreadyEnrolled = await FS.exists(identity) && (await probeKeyLogin(host, identity)).status === 0
  if (!alreadyEnrolled) {
    await copyKeyToHost(host, identity)
  }
  await installSshConfig(host, identity, Path.home('.ssh', 'config'))
  await verifyKeyLogin(host)
  IO.print(`SSH is ready for ${host}. A fresh login used your saved settings without prompting.`)
}

async function copyKeyToHost(host: string, identity: string): Promise<void> {
  if (!Terminal.isInteractive()) {
    Errors.ThrowUserInput('Run just ssh-key-setup HOST in Terminal to enroll the key.')
  }
  await prepareKey(host, identity)
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-add', { variadicArgs: ['--apple-use-keychain', identity] })
  IO.print(`Installing the public key on ${host}. SSH may ask for the remote login password once.`)
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-copy-id', {
    variadicArgs: ['-i', identity + PublicKeySuffix, '-o', 'ConnectTimeout=10', '--', host],
  })
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
    Errors.ThrowUserInput(`SSH key pair is incomplete at ${identity}. Restore the missing file before retrying.`)
  }
  if (privateExists) {
    return
  }
  await FS.mkdirPrivate(Path.dirname(identity))
  IO.print('Choose a passphrase for the dedicated key. macOS Keychain can store it for later logins.')
  await CLIKit.runInteractiveCommand('/usr/bin/ssh-keygen', {
    variadicArgs: ['-t', 'ed25519', '-f', identity, '-C', `tao:${host}`],
  })
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

function probeKeyLogin(host: string, identity: string) {
  const args = [
    ...FreshLoginArgs,
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
  return Exec.capture('/usr/bin/ssh', args, { check: false })
}

async function verifyKeyLogin(host: string): Promise<void> {
  const result = await Exec.capture('/usr/bin/ssh', [...FreshLoginArgs, '--', host, 'true'], { check: false })
  if (result.status !== 0) {
    Errors.ThrowHostEnvironment(`A fresh key-only SSH login to ${host} failed. ${result.stderr.trim()}`)
  }
}
