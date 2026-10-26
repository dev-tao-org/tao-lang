# Prepare the semantic AST before a command graph imports it in a fresh worktree.
if [ ! -f "$repository/ts/2-ast-gen/_gen_AST/AST-generated.ts" ]; then
  "$repository/agent" setup
fi
