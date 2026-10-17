# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `.x-tao-old-v1/` PoC working again:

- [x] Get tests running inside of `.x-tao-old-v1/` folder again.
- [x] Changes outside of that folder should be minimal.

## Goal 2

Implement a first e2e Hello World app:

- [x] Implement basic treesitter parser
  - [ ] Extend the first-app grammar with generic view renders/calls, function declarations and raw TypeScript injection; define Text and Col in the app source.
- [ ] Implement basic treesitter CST to AST transformer
- [ ] Implement basic AST to code generator
- [ ] Implement basic expo runtime
  - [ ] Create a TypeScript runtime folder owning the handwritten code included in compiled Tao app scaffolds, with app-side performance instrumentation exposed to the harness.
- [ ] Write a basic test that checks "Hello World" is showing in the app
- [ ] Implement basic testing framework
- [ ] Implement a minimal preview-refresh performance package and automated harness, using the runtime's granular app-side measurements.

### Preview-refresh performance

- Provide `tao compile <app-entry-file>` and a shared in-process compiler API. The performance web server calls that API directly, then saves generated Expo modules for normal refresh.
- The performance package owns a minimal TypeScript webapp, Tao fixture and automated runner. Start Expo once and display the same compiled app in two iframes of different sizes.
- A button sends a command to the performance web server to edit a fixture source file and fully recompile. Automation exercises the same command path.
- Measure text replacement and a structural sequence that adds a Text view, then changes Col to Row. Record each edit step separately in both previews.
- Establish reusable timing support and place measurements at the actual workflow boundaries: source update, parsing, CST-to-AST transformation, code generation, generated-file publication and preview refresh.
- The handwritten app runtime exposes granular measurements of applicable operations, including generated-module application, view construction/rendering, commit and layout. The harness correlates these with the source update and observes the resulting visual update in each iframe; a runtime acknowledgement alone does not prove repaint.
- Attribute results to the source revision, edit scenario and iframe size. Keep server and browser clock domains explicit, and distinguish runtime completion, layout and observed paint. Save structured results and report repeated cold-start and warm-refresh samples under [Performance](../Performance/README.md).
- Keep this first baseline to full recompilation and the minimal app. Studio integration and partial recompilation follow later.

### Minimal first app

The canonical source is [Apps/Tests/Hello World.tao](../../Apps/Tests/Hello%20World.tao).

### Success criteria

- The minimal Tao app passes through parsing, CST-to-AST transformation and code generation into the Expo runtime.
- End-to-end tests confirm that "Hello World" appears on web, headless iOS Simulator and headless Android Emulator.
- CI runs all three platforms by default, sharing the generated Tao output and running platform jobs in parallel. Each platform still needs its own bundle and native build where applicable.
- Local tests can select a platform for fast iteration. Record cold and warm CI timings before adding further build infrastructure.
- The compiled app scaffold uses the new handwritten TypeScript runtime; the performance harness automatically measures the specified edits through visible updates in both iframe sizes, with granular runtime-operation timings alongside compiler and refresh timings.
- Measure implementation hot paths and run their performance tests before landing. Investigate increases and iterate until diminishing returns or further work would add too much complexity for the slice; record results and remaining costs under [Performance](../Performance/README.md).
