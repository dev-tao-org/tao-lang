import { NewlineCharacter, Regxs } from '@shared'

const AuthenticationPrefix = 'Authenticated to '
const PublicKeyMethodSuffix = 'using "publickey".'
const PublicKeySigningPrefix = 'debug3: sign_and_send_pubkey: signing using '

/** readAuthenticatedKeyFingerprint reads the signing key of a completed public-key SSH login. */
export function readAuthenticatedKeyFingerprint(diagnostics: string): string | undefined {
  const lines = diagnostics.split(NewlineCharacter)
  const authenticated = lines.findIndex(line => line.startsWith(AuthenticationPrefix))
  if (authenticated === -1 || !lines[authenticated].trimEnd().endsWith(PublicKeyMethodSuffix)) {
    return undefined
  }
  const signing = lines.slice(0, authenticated).findLast(line => line.startsWith(PublicKeySigningPrefix))
  return signing?.match(Regxs.SshPublicKeyFingerprintRegx)?.[0]
}
