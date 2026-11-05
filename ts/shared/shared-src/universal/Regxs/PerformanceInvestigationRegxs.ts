/** PerformanceJobSampleNameRegx matches a retained per-session sample filename. */
export const PerformanceJobSampleNameRegx = /^sample-[1-9]\d*\.json$/

/** SshConfigHostLineRegx captures aliases declared by an SSH Host line. */
export const SshConfigHostLineRegx = /^\s*Host\s+(.+)$/gmi

/** SshConfigAliasesWhitespaceRegx splits aliases declared on one SSH Host line. */
export const SshConfigAliasesWhitespaceRegx = /\s+/

/** SshAliasRegx matches a named SSH alias accepted for connection. */
export const SshAliasRegx = /^[a-z\d][a-z\d_.-]*$/i

/** SshHostRegx matches an SSH alias or user and hostname pair. */
export const SshHostRegx = /^(?:[a-z\d_][a-z\d_.-]*@)?[a-z\d][a-z\d_.:-]*$/i

/** RemotePathControlCharacterRegx matches null and line breaks forbidden in runner paths. */
export const RemotePathControlCharacterRegx = /[\0\r\n]/

/** PreviewReportFilenameRegx matches raw preview report files. */
export const PreviewReportFilenameRegx = /^preview-.*\.json$/

/** MeasurementScenarioCycleSuffixRegx removes the cycle number from a scenario name. */
export const MeasurementScenarioCycleSuffixRegx = /-\d+$/
