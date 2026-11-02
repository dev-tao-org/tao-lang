# Private Views WIP

Views declared inside another view are private to that owner and share its lexical scope.

```tao
view Profile(Name text) {
  render Col {
    Greeting
  }

  view Greeting {
    render Text(Name)
  }
}
```

#### `view Greeting` inside `Profile`

Declare private views after the owning view's render statement. The render may use the nested view
before its declaration. Nested views in the same group can refer to one another, and descendants can
refer to their ancestors' sibling group through ordinary lexical resolution.
