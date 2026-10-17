import { IO, repositoryRoot, runCommand, runSteps } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem } from '@shared/os'
import { registerCommand } from './_command-runner'

/** startCommand starts a supported repository service with its complete setup. */
export default registerCommand({
  name: 'start',
  description: 'Start a repository service.',
  arguments: [{ name: 'service', required: true }],
  action: async (service: string) => {
    if (service !== 'local-instantdb') {
      Errors.ThrowUserInput('Supported service: local-instantdb.')
    }
    const cwd = `${repositoryRoot}/.config/local-instantdb`
    await runSteps(
      () =>
        runCommand('docker compose --project-name tao-local-instantdb --file docker-compose.yml up --detach --wait', {
          cwd,
        }),
      () =>
        runCommand(
          'docker compose --project-name tao-local-instantdb --file docker-compose.yml exec -T postgres psql --set ON_ERROR_STOP=1 --username instant --dbname instant --set app_id=9faf89c0-c15c-49b4-bf3f-3b5b2cd9a19f --file /dev/stdin',
          {
            cwd,
            stdin: FileSystem.file(`${repositoryRoot}/.config/local-instantdb/seed-app.sql`),
          },
        ),
    )
    // The new app, compiler and runtime have not yet been ported; this provisions only the local service.
    IO.info('InstantDB is ready at http://localhost:9020 (dashboard: http://localhost:3000)')
  },
})
