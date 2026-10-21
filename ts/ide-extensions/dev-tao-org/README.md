# Dev Tao Org

Press Cmd+Shift+D in a file to compare it with `<working-branch>-incremental-review-approved`. For example, `feat/topic` compares with `feat/topic-incremental-review-approved`. A missing branch is reported; the extension never creates one or silently falls back to main.

Press Cmd+Shift+Ctrl+D or run **Dev Tao: Change Diff Base** to choose an existing branch explicitly. Overrides are remembered for each worktree and working branch across editor restarts. Canceling leaves the choice unchanged; a deleted override is reported instead of replaced automatically.

Cmd+Shift+B in the Tao repository builds and installs both Dev Tao Org and Tao Language Support into Cursor and VS Code. The comparison uses GitLens, which is declared as an extension dependency.
