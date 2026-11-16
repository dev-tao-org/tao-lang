import * as CLIKit from '@cli-kit'
import { Errors } from '@shared'
import { Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** stopCommand stops a supported repository service without deleting its data volumes. */
export default registerCommand({
  name: 'stop',
  description: 'Stop a repository service, preserving its data.',
  arguments: [{ name: 'service', required: true }],
  async action(service: string) {
    if (service !== 'local-instantdb') {
      Errors.ThrowUserInput('Supported service: local-instantdb.')
    }
    await CLIKit.runNonInteractiveCommand(
      'docker',
      'compose --project-name tao-local-instantdb --file docker-compose.yml down',
      {
        cwd: Repo.resolvePath('.config/local-instantdb'),
      },
    )
  },
})
