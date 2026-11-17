import { IO } from '@cli-kit'
import { Json, UserInput } from '@shared'
import { assertDoctorReady, type DoctorReport, doctorReport } from '../../cli-checks/doctor'
import { registerCommand } from './_command-runner'

/** doctorCommand reports setup issues or explicitly requested environment diagnostics. */
export default registerCommand({
  name: 'doctor',
  description: 'Diagnose this checkout; accepts --json or --fingerprint.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    UserInput.Require(
      !args.some(arg => arg !== '--json' && arg !== '--fingerprint'),
      'Usage: doctor [--json] [--fingerprint]',
    )
    const fingerprintOnly = args.includes('--fingerprint')
    const report = await doctorReport(fingerprintOnly)
    if (fingerprintOnly) {
      IO.print(formatDoctorOutput(report.fingerprint))
      return
    }
    if (args.includes('--json')) {
      IO.print(formatDoctorOutput(report))
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

type DoctorOutput = DoctorReport | DoctorReport['fingerprint']

function formatDoctorOutput(report: DoctorOutput): string {
  return Json.Print(report)
}
