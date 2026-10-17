import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { registerCommand } from './_command-runner'

/** doctorCommand diagnoses the active checkout and prints a safe environment fingerprint. */
export default registerCommand({
  name: 'doctor',
  description: 'Diagnose this checkout; accepts --json or --fingerprint.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    if (args.some(arg => arg !== '--json' && arg !== '--fingerprint')) {
      Errors.ThrowUserInput('Usage: doctor [--json] [--fingerprint]')
    }
    const { assertDoctorReady, doctorReport } = await import('../../cli-kit/repository-doctor')
    const fingerprintOnly = args.includes('--fingerprint')
    const report = await doctorReport(fingerprintOnly)
    if (fingerprintOnly) {
      IO.info(JSON.stringify(report.fingerprint, null, 2))
      return
    }
    if (args.includes('--json')) {
      IO.info(JSON.stringify(report, null, 2))
    } else {
      for (const check of report.checks) {
        const line = `${check.status.toUpperCase()} ${check.name}: ${check.detail}${
          check.remediation ? ` Run: ${check.remediation}` : ''
        }`
        ;(check.status === 'fail' ? IO.error : IO.info)(line)
      }
      IO.info(
        'Environment (safe to paste; ./agent doctor --fingerprint):\n' + JSON.stringify(report.fingerprint, null, 2),
      )
      IO.info(`doctor: ${report.status}`)
    }
    assertDoctorReady(report.status)
  },
})
