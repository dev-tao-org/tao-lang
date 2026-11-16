# Decision policy branch preview comparison

Compared the original branch base `b4792553c75049b946aed7fc7fcd4c7e52c4f533`
with reviewed implementation `2361952bb2c5a16f1be68491fb565fdd8e0b5bba`.

- First text edit was 193.4 ms on the base and 190.0 ms on the reviewed revision. The median
  paired change was -4.5 ms (-2.3%). Between-round variation leaves the first-edit effect
  inconclusive.
- Warm edits were 172.7 ms on the base and 157.0 ms on the reviewed revision. The median
  paired change was -16.0 ms (-9.2%), with the reviewed revision faster in
  11 of 13 pairs.

Thirteen alternating pairs ran on the same arm64 macOS host with Chrome 157.0.8103.51,
Bun 1.4.2, and 380×756 and 899×756 frames. Each session ran 24 edits on the same
fixture with 240 additional unmounted views in the entry file. The warm result uses
each session median after the first four edits. The measured endpoint is the parent
click through the last frame's matching React commit receipt.

The reviewed checkout used an isolated benchmark patch to reuse the base's
four-edit cycle and match frame dimensions. The patch changes benchmark code only.
Startup and reopen have different measurement boundaries between revisions.
The newer imported-tree and dependency-edit scenarios lack a matching base run.

The [archive inventory and timing packet](https://github.com/dev-tao-org/tao-lang-storage/tree/0bd2e7ee72a07ac775595c43c3e9a0139b6e9b04/evidence/2361952bb2c5a16f1be68491fb565fdd8e0b5bba/decision-policy-landing)
preserve the patch, raw reports, pair-level calculations, review checkpoint and
commit-record digests. The final independent source review had no open P0–P2
findings. Local verification passed 620 TypeScript tests and six Tao journeys.
