/** TimingJobIdRegx matches one retained job directory identifier. */
export const TimingJobIdRegx = /^[a-f\d-]{36}$/i

/** TimingJobAnnouncementRegx captures the runner's exact completed job path. */
export const TimingJobAnnouncementRegx = /^Performance job: (.+)$/gm

/** TimingListingLineBreakRegx splits runner output while retaining LF and CRLF support. */
export const TimingListingLineBreakRegx = /\r?\n/

/** TimingReportTimestampRegx matches a UTC timestamp with millisecond precision. */
export const TimingReportTimestampRegx = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
