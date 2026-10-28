/** PathSeparatorRegx splits paths on either supported path separator. */
export const PathSeparatorRegx = /[\\/]/

/** TrailingSlashRegx matches a slash at the end of a path. */
export const TrailingSlashRegx = /\/$/

/** TaoSourceExtensionRegx matches a Tao source suffix. */
export const TaoSourceExtensionRegx = /\.tao$/

/** TypeScriptSourceExtensionRegx matches a TypeScript source suffix. */
export const TypeScriptSourceExtensionRegx = /\.tsx?$/

/** TypeScriptModuleExtensionRegx matches a TypeScript module suffix. */
export const TypeScriptModuleExtensionRegx = /\.(?:tsx?|mts|cts)$/

/** GeneratedFileExtensionRegx matches a supported generated source or metadata suffix. */
export const GeneratedFileExtensionRegx = /\.(?:tao|tsx?|mts|cts|jsx?|json)$/

/** GeneratedModuleExtensionRegx matches generated Tao view and design suffixes. */
export const GeneratedModuleExtensionRegx = /\.(?:views|design|data|previews)$/

/** LockFileExtensionRegx matches a lock-file suffix. */
export const LockFileExtensionRegx = /\.lock$/

/** GitSuffixRegx matches a Git repository suffix. */
export const GitSuffixRegx = /\.git$/

/** GithubRepositoryUrlPrefixRegx matches the GitHub repository URL prefix. */
export const GithubRepositoryUrlPrefixRegx = /^https:\/\/github\.com\//

/** SourceDirectoryPrefixRegx matches the source directory prefix. */
export const SourceDirectoryPrefixRegx = /^src\//
