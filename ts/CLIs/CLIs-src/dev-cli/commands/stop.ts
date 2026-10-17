import { repositoryRoot, runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { registerCommand } from './_command-runner'

/** stopCommand stops a supported repository service without deleting its data volumes. */
export default registerCommand({
  name: 'stop',
  description: 'Stop a repository service, preserving its data.',
  arguments: [{ name: 'service', required: true }],
  action: async (service: string) => {
    if (service !== 'local-instantdb') {
      Errors.ThrowUserInput('Supported service: local-instantdb.')
    }
    await runCommand('docker compose --project-name tao-local-instantdb --file docker-compose.yml down', {
      cwd: `${repositoryRoot}/.config/local-instantdb`,
    })
  },
})
