# Codegen ownership evidence

The refactor in `8e3ccf2342d234a6c1db8fd2220737b5e807d8a2` moves library package
source and sidecar declarations into `@compile`. The workspace resolves build settings,
runs bundling and TypeScript, and publishes the files. The verified authored tree
`82a13c168a3126137e298fbda2fccd46e7b06eef` includes the separate accepted-design
documentation commit `2840ea7a1757e439fad836e520bd2d1c6095e84e`.

Host verification passed 650 TypeScript tests and six Tao journeys, including an ordinary
TypeScript consumer of the compiled library and an npm-backed foreign view in Chromium.
The public library entry points, declarations, and manifest were byte-identical to the
baseline. The app parser benchmark covered the same fixture before and after the refactor.
It measured compiler phases and excluded live browser refresh and isolated timings of the moved emitters.

The [local evidence inventory](../../.artifacts/notes/codegen-owner/archive-staging/evidence/8e3ccf2342d234a6c1db8fd2220737b5e807d8a2/codegen-owner/inventory.json)
records source identities and SHA-256 hashes for both parser reports, the verification results,
and the checkpoint. It is available in the retained source worktree. Archive publication
and the associated `.storage` pointer are pending. The intended archive directory is
`evidence/8e3ccf2342d234a6c1db8fd2220737b5e807d8a2/codegen-owner/`.
