/** ModuleNameRegx validates a fully qualified Tao module name. */
export const ModuleNameRegx = /^@[A-Za-z0-9][A-Za-z0-9._-]*$/

/** ModuleNameSegmentRegx validates an unqualified module-name segment. */
export const ModuleNameSegmentRegx = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** ModuleAliasRegx validates a module alias accepted by the resolver. */
export const ModuleAliasRegx = /^@[A-Za-z_][\w.-]*$/

/** ModuleSourceKeyRegx captures the source and module portions of a key. */
export const ModuleSourceKeyRegx = /^([A-Za-z0-9_-]+)@([A-Za-z_][\w.-]*)$/

/** UppercaseInitialRegx matches a leading ASCII uppercase letter. */
export const UppercaseInitialRegx = /^[A-Z]/

/** JavaScriptIdentifierRegx validates an identifier used in generated JavaScript. */
export const JavaScriptIdentifierRegx = /^[A-Za-z_$][\w$]*$/

/** SessionIdRegx validates a persisted session identifier. */
export const SessionIdRegx = /^[a-z0-9][a-z0-9_-]*$/

/** EnvironmentVariableNameRegx validates an environment variable name. */
export const EnvironmentVariableNameRegx = /^[A-Z][A-Z0-9_]*$/

/** LowercaseOperationNameRegx identifies a lowercase-leading file operation. */
export const LowercaseOperationNameRegx = /^[a-z]/

/** PackageNameSegmentRegx validates one scoped or unscoped package-name segment. */
export const PackageNameSegmentRegx = ModuleNameSegmentRegx

/** RegistryDependencyPinRegx recognizes a scoped or unscoped registry package with an exact version. */
export const RegistryDependencyPinRegx =
  /^(?:@[a-zA-Z0-9][\w.-]*\/)?[a-zA-Z0-9][\w.-]*@(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?(?:\+[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/

/** GithubCoordinateRegx validates a GitHub owner or repository name. */
export const GithubCoordinateRegx = /^[A-Za-z0-9_.-]+$/

/** SafeCommandTokenRegx identifies strings safe to print without quoting. */
export const SafeCommandTokenRegx = /^[\w./:=@+-]+$/

/** RuntimeNameRegx validates a single generated runtime name. */
export const RuntimeNameRegx = /^[A-Za-z0-9._-]+$/

/** PackageAliasPrefixRegx matches a package alias before its module separator. */
export const PackageAliasPrefixRegx = /^[A-Za-z0-9_-]+@/

/** LeadingTaoQualifiedNameRegx matches a Tao name at the beginning of a source fragment. */
export const LeadingTaoQualifiedNameRegx = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/
