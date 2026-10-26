import { Try } from '@shared'
import * as vscode from 'vscode'
import { chooseDiffBase, diffArguments } from './DiffReview'

/** activate registers repository review commands independently of Tao language support. */
export function activate(context: vscode.ExtensionContext) {
  for (const [command, force] of [['diffWithBase', false], ['changeDiffBase', true]] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`dev-tao-org.${command}`, () =>
        Try(() => reviewFile(context, force), {
          catch: error => vscode.window.showErrorMessage(`Cannot open review comparison: ${String(error)}`),
        })),
    )
  }
}

interface GitRepository {
  rootUri: vscode.Uri
  state: GitRepositoryState
  getBranches(query: { remote: boolean }): Promise<{ name?: string }[]>
}

type GitRepositoryHead = { name?: string }

type GitRepositoryState = { HEAD?: GitRepositoryHead }

interface GitExtension {
  getAPI(version: 1): { getRepository(uri: vscode.Uri): GitRepository | null }
}

async function reviewFile(context: vscode.ExtensionContext, force: boolean): Promise<void> {
  const uri = vscode.window.activeTextEditor?.document.uri
  if (!uri || uri.scheme !== 'file') {
    await vscode.window.showInformationMessage('Open a file in the worktree you want to review.')
    return
  }
  const git = await vscode.extensions.getExtension<GitExtension>('vscode.git')?.activate()
  const repository = git?.getAPI(1).getRepository(uri)
  if (!repository) {
    await vscode.window.showWarningMessage('The current file does not belong to an available Git repository.')
    return
  }
  const branches = [
    ...new Set(
      (await repository.getBranches({ remote: true }))
        .map(branch => branch.name).filter((name): name is string => Boolean(name)),
    ),
  ].sort()
  const base = await chooseDiffBase(
    repository.rootUri.toString(),
    repository.state.HEAD?.name,
    branches,
    {
      get: key => context.globalState.get<string>(key),
      update: (key, value) => context.globalState.update(key, value),
    },
    pickBranch,
    force,
  )
  if (base && !force) {
    await vscode.commands.executeCommand('gitlens.diffWith', diffArguments(repository.rootUri.fsPath, base, uri))
  }
}

function pickBranch(branches: readonly string[], selected: string | undefined): Promise<string | undefined> {
  return new Promise(resolve => {
    const picker = vscode.window.createQuickPick()
    picker.title = 'Choose this worktree’s review base'
    picker.placeholder = 'Select a local or remote branch'
    picker.items = branches.map(label => ({ label }))
    picker.activeItems = picker.items.filter(item => item.label === selected)
    const finish = (value: string | undefined) => {
      accepted.dispose()
      hidden.dispose()
      picker.dispose()
      resolve(value)
    }
    const accepted = picker.onDidAccept(() => finish(picker.selectedItems[0]?.label))
    const hidden = picker.onDidHide(() => finish(undefined))
    picker.show()
  })
}
