export {
  DoctorToken,
  NativeIncludeDirective,
  SingleQuote,
  TestReportTag,
  TestSourceSuffix,
  ToolVersionToken,
  TrailingComma,
  VersionPrefix,
  WindowsPathSeparator,
  XmlAttribute,
  XmlEntity,
  XmlToken,
}

/** DoctorToken matches a portable token safe to include in a diagnostic fingerprint. */
const DoctorToken = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/
/** ToolVersionToken matches version output with an optional v prefix. */
const ToolVersionToken = /^v?[0-9][0-9A-Za-z._+-]*$/
/** VersionPrefix matches the conventional leading v in version output. */
const VersionPrefix = /^v/
/** TrailingComma matches punctuation after a tool version token. */
const TrailingComma = /,$/
/** NativeIncludeDirective matches the node-addon-api include command in GYP input. */
const NativeIncludeDirective = /<!.+?include_dir"\)/
/** WindowsPathSeparator matches every Windows path separator for GYP normalization. */
const WindowsPathSeparator = /\\/g
/** SingleQuote matches every quote requiring GYP string escaping. */
const SingleQuote = /'/g
/** TestSourceSuffix matches TypeScript test source filenames. */
const TestSourceSuffix = /\.test\.[cm]?tsx?$/
/** XmlToken matches whole XML tokens while retaining quoted delimiters and opaque sections. */
const XmlToken = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:"[^"]*"|'[^']*'|[^'">])*>/g
/** TestReportTag matches timing report element names and their closing markers. */
const TestReportTag = /^<(\/?)(testsuite|testcase|skipped)\b/
/** XmlAttribute matches quoted XML attribute names and values. */
const XmlAttribute = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
/** XmlEntity matches numeric references and the predefined XML entities. */
const XmlEntity = /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi
/** PackageOrderPrefixRegx matches the ordering prefix on a workspace package directory. */
export const PackageOrderPrefixRegx = /^\d+(?:\.\d+)?-/
