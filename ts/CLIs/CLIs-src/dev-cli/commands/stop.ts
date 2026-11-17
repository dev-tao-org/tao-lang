import * as CLIKit from '@cli-kit'
import { UserInput } from '@shared'
import { Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** stopCommand stops a supported repository service without deleting its data volumes. */
export default registerCommand({
  name: 'stop',
  description: 'Stop a repository service, preserving its data.',
  arguments: [{ name: 'service', required: true }],
  async action(service: string) {
    UserInput.Require(service === 'local-instantdb', 'Supported service: local-instantdb.')
    await CLIKit.runNonInteractiveCommand(
      'docker',
      'compose --project-name tao-local-instantdb --file docker-compose.yml down',
      {
        cwd: Repo.resolvePath('.config/local-instantdb'),
      },
    )
  },
})
