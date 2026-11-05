import { Env, Path, Repo } from '@shared/os'

/** resolveCallerPath resolves Tao CLI arguments before the launcher changes into its implementation folder. */
export function resolveCallerPath(path: string): string {
  return Path.resolve(Env.get('TAO_CLI_CWD') ?? Repo.getWorkspaceRoot(), path)
}
