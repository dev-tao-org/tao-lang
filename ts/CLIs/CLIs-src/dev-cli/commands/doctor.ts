import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { assertDoctorReady, doctorReport } from '../../cli-checks/doctor'
import { registerCommand } from './_command-runner'

/** doctorCommand reports setup issues or explicitly requested environment diagnostics. */
export default registerCommand({
  name: 'doctor',
  description: 'Diagnose this checkout; accepts --json or --fingerprint.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    if (args.some(arg => arg !== '--json' && arg !== '--fingerprint')) {
      Errors.ThrowUserInput('Usage: doctor [--json] [--fingerprint]')
    }
    const fingerprintOnly = args.includes('--fingerprint')
    const report = await doctorReport(fingerprintOnly)
    if (fingerprintOnly) {
      IO.print(JSON.stringify(report.fingerprint, null, 2))
      return
    }
    if (args.includes('--json')) {
      IO.print(JSON.stringify(report, null, 2))
    } else {
      for (const check of report.checks.filter(check => check.status !== 'pass')) {
        const line = `${check.status.toUpperCase()} ${check.name}: ${check.detail}${
          check.remediation ? ` Run: ${check.remediation}` : ''
        }`
        IO.warn(line)
      }
    }
    assertDoctorReady(report.status)
  },
})
