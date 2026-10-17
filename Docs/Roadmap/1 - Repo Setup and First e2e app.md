# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `.x-tao-old-v1/` PoC working again:

- [x] Get tests running inside of `.x-tao-old-v1/` folder again.
- [x] Changes outside of that folder should be minimal.

## Goal 2

Implement a first e2e Hello World app:

- [ ] Implement basic treesitter parser
- [ ] Implement basic treesitter CST to AST transformer
- [ ] Implement basic AST to code generator
- [ ] Implement basic expo runtime
- [ ] Write a basic test that checks "Hello World" is showing in the app
- [ ] Implement basic testing framework

### Minimal first app

```tao
app HelloWorld {
    Root RootView
}

view RootView {
    render Col {
        Text("Hello World")
    }
}
```

### Success criteria

- The minimal Tao app passes through parsing, CST-to-AST transformation and code generation into the Expo runtime.
- End-to-end tests confirm that "Hello World" appears on web, headless iOS Simulator and headless Android Emulator.
- CI runs all three platforms by default, sharing the generated Tao output and running platform jobs in parallel. Each platform still needs its own bundle and native build where applicable.
- Local tests can select a platform for fast iteration. Record cold and warm CI timings before adding further build infrastructure.
- Measure implementation hot paths and run their performance tests before landing. Investigate increases and iterate until diminishing returns or further work would add too much complexity for the slice; record results and remaining costs under [Performance](../Performance/README.md).
