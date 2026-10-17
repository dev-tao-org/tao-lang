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
