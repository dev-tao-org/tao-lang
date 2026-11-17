/** ReviewArtifactSuffixRegx matches metadata and text artifacts accepted by review tooling. */
export const ReviewArtifactSuffixRegx = /\.(json|md|txt)$/

/** ReviewProposalIdRegx validates identifiers stored in review sessions. */
export const ReviewProposalIdRegx = /^[a-f0-9-]{36}$/

/** TypeScriptSourceFileRegx matches TypeScript and module-flavored source suffixes. */
export const TypeScriptSourceFileRegx = /\.[cm]?tsx?$/

/** ReviewConfigurationFileNameRegx matches package and TypeScript configuration files. */
export const ReviewConfigurationFileNameRegx = /(^|\/)(tsconfig[^/]*\.json|package\.json|bun\.lock)$/

/** ReviewGeneratedMarkerRegx identifies files excluded from review learning. */
export const ReviewGeneratedMarkerRegx = /@third-party|@generated|DO NOT EDIT/

/** LearningIdentifierRegx validates a short identifier accepted by review learning. */
export const LearningIdentifierRegx = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/

/** ExtensionLineEndingRegx splits extension command output on supported line endings. */
export const ExtensionLineEndingRegx = /\r?\n/u

/** GitStatusChangeCodeRegx matches change codes emitted by porcelain status. */
export const GitStatusChangeCodeRegx = /[DRCU!]/

/** LandStatusLineRegx matches a changed or untracked status line. */
export const LandStatusLineRegx = /^(- |  )\S/

/** GitRefHeadRegx captures a branch ref and its commit from show-ref output. */
export const GitRefHeadRegx = /^ref: (refs\/heads\/[^\s]+)\s+HEAD/m

/** FeatureBranchNameRegx validates a feature branch name accepted by landing. */
export const FeatureBranchNameRegx = /^feat\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

/** AgentInstructionPathRegx matches instruction files in a changed path. */
export const AgentInstructionPathRegx = /(^|\/)(AGENTS|CLAUDE)\.md$/

/** LowercaseHashRangeRegx matches lowercase hexadecimal hashes from 40 to 64 characters. */
export const LowercaseHashRangeRegx = /^[a-f0-9]{40,64}$/

/** TrailingNewlineRegx matches one newline at the end of command output. */
export const TrailingNewlineRegx = /\n$/

/** NixDirenvExecutableRegx captures a direnv executable in the Nix store. */
export const NixDirenvExecutableRegx = /^(\/nix\/store\/[a-z0-9]{32}-[^/]+)\/bin\/direnv$/

/** LineBreakRegx matches either supported line-break character. */
export const LineBreakRegx = /[\r\n]/

/** ManagedTestShardRegx matches tests assigned to the managed acceptance shard. */
export const ManagedTestShardRegx = /^(sidecars\.ManagedMetroAcceptance|expo\.ToolchainAcceptance)\.test\.ts$/

/** LargeTestShardRegx matches integration tests assigned to the large shard. */
export const LargeTestShardRegx =
  /^(client\.ReactOwnership|Workspace\.(CompilerRefreshAcceptance|NestedRefresh)|Preview\.Recovery|Metro\.(Integration|Guards)|SidecarPipeline\.Core)\.test\.ts$/

/** NegativeConfirmationRegx recognizes a negative yes/no response. */
export const NegativeConfirmationRegx = /^n(o)?$/i

/** PublicKeyCommentRegx captures an age public key from its comment line. */
export const PublicKeyCommentRegx = /^#\s*public key:\s*(\S+)\s*$/m

/** AgePublicKeyCommentRegx captures an age public key from its comment line. */
export const AgePublicKeyCommentRegx = /^#\s*public key:\s*(age1\S+)\s*$/m

/** AgeSecretKeyLineRegx recognizes an age secret key line. */
export const AgeSecretKeyLineRegx = /^AGE-SECRET-KEY-1\S+$/m

/** BranchSlugWhitespaceRegx collapses whitespace while forming a branch slug. */
export const BranchSlugWhitespaceRegx = /\s+/u

/** BranchSlugInvalidCharacterRegx replaces invalid branch slug characters. */
export const BranchSlugInvalidCharacterRegx = /[^a-z0-9._-]+/gu

/** BranchSlugEdgeDashesRegx removes dashes from the ends of a branch slug. */
export const BranchSlugEdgeDashesRegx = /^-+|-+$/gu

/** CliGlobTokenRegx detects glob syntax in forwarded CLI arguments. */
export const CliGlobTokenRegx = /[*?\[{]/

/** SingleWhitespaceRegx matches one whitespace character when checking command tokens. */
export const SingleWhitespaceRegx = /\s/u

/** DiagnosticWhitespaceRunsRegx collapses all whitespace in a diagnostic. */
export const DiagnosticWhitespaceRunsRegx = /\s+/g

/** SkillFrontmatterBlockRegx captures the frontmatter block in a skill file. */
export const SkillFrontmatterBlockRegx = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** SkillFrontmatterNameRegx captures the skill name from frontmatter. */
export const SkillFrontmatterNameRegx = /^name:\s*([A-Za-z0-9_-]+)\s*$/m
/** CommandRegistrationImportRegx matches side-effect command registrations in CLI entrypoints. */
export const CommandRegistrationImportRegx = /^import\s+['"](\.\/commands\/[^'"]+)['"]\s*;?\s*$/gm

/** HttpStatusLineRegx captures the status code at the start of a CLI HTTP response. */
export const HttpStatusLineRegx = /^HTTP\/\S+ (\d{3})\b/u

/** HttpHeaderEndRegx matches the empty line separating CLI HTTP headers from the body. */
export const HttpHeaderEndRegx = /\r?\n\r?\n/u

/** HttpETagHeaderRegx captures an ETag value in CLI HTTP response headers. */
export const HttpETagHeaderRegx = /^etag:[ \t]*([^\r\n]+)/imu
