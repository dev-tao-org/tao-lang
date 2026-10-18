---
name: developer-gotchas
description: >-
  Diagnose developer tooling mismatches and suggest relevant known gotchas. Use when Cursor or
  VS Code reports TypeScript errors absent from check, editor and terminal diagnostics disagree,
  or the developer asks about selecting the workspace TypeScript version.
---

# Developer Gotchas

## Editor TypeScript differs from check

- When editor errors are absent from `check`, compare the exact file, project configuration and
  compiler version before changing code or weakening checks. Confirm the file belongs to the
  checked TypeScript program; aliases or symlinks into the reference implementation can give the
  editor a different project. Follow root policy before running any legacy checks.
- `check` uses the pinned TypeScript dependency owned by `ts/CLIs`. The editor runs a separate language service; inspect
  its selected version and server path through the TypeScript output log or version picker.
  A stale JavaScript and TypeScript Nightly extension (`ms-vscode.vscode-typescript-next`) can
  replace the editor's bundled compiler with one incompatible with the installed type packages.
- Suggest selecting the workspace version when the editor/compiler versions differ or the
  diagnostic cannot be reproduced by the checked project. Open a TypeScript file, run
  **TypeScript: Select TypeScript Version**, choose **Use Workspace Version**, and restart the
  TypeScript server if diagnostics persist. Confirm the selected version and path afterward.
- Root `.vscode/settings.json` provides both legacy and current SDK/prompt settings for supported
  editor versions. These expose and prompt for the workspace version; they do not force selection.
  After a package-layout change, confirm the configured SDK exists before attributing a missing
  version to a failed install.
- Removing Nightly normally restores the editor's bundled compiler; it does not select the repo
  version. Keeping the extension while selecting the workspace version is also valid. Check the
  active editor profile if an installed extension is missing from the Extensions view.
- If the same supported compiler, file and configuration reproduce the error, fix the code or
  check coverage. Avoid casts or compatibility workarounds solely to silence an unsupported editor
  compiler. Do not change user settings or extensions without authorization.

References: [VS Code compiler selection](https://code.visualstudio.com/docs/typescript/typescript-transpiling#_using-the-workspace-version-of-typescript),
[Nightly extension behavior](https://github.com/microsoft/vscode-typescript-next#readme).
