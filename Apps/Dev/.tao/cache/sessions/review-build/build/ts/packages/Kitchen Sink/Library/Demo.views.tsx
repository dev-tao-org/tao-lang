import * as TR from '@tao/runtime/generated';
import Tao from '@tao/runtime/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Demo";


export function TaoView_LibraryGreeting$PrivateCaption_8cfe0e533c18(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "First" | "Second" | "PrivateCaption"> & { readonly "First": string; readonly "Second": string; readonly "PrivateCaption": TR.View };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Text["Text"],
    TR.ViewRenderArguments(["Compiled Tao library"], [])
  ));
}
export function TaoView_LibraryGreeting_8cfe0e533c18(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "First" | "Second" | "PrivateCaption"> & { readonly "First": string; readonly "Second": string; readonly "PrivateCaption": TR.View };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  TR.LetDeclaration(_Scope, "PrivateCaption", TR.ViewDeclaration("PrivateCaption", [], TaoView_LibraryGreeting$PrivateCaption_8cfe0e533c18, _Scope));
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["First"]], [])
      ),
      TR.ViewRenderExpression(
        _Scope["PrivateCaption"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["Second"]], [])
      )
    ])
  ));
}