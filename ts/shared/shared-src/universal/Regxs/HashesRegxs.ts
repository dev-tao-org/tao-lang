/** GitCommitHashRegx validates a full SHA-1 or SHA-256 Git object identifier. */
export const GitCommitHashRegx = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i

/** Sha256HashRegx validates a hexadecimal SHA-256 digest. */
export const Sha256HashRegx = /^[a-f0-9]{64}$/i

/** LowercaseSha256HashRegx validates a lowercase hexadecimal SHA-256 digest. */
export const LowercaseSha256HashRegx = /^[a-f0-9]{64}$/

/** Sha1HashRegx validates a lowercase SHA-1 object identifier. */
export const Sha1HashRegx = /^[a-f0-9]{40}$/

/** UuidRegx validates a hyphenated UUID. */
export const UuidRegx = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
