import * as TR from '@runtime';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Other";


export function TaoView_Unselected_6e43c6a20700(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Text["Text"],
    TR.ViewRenderArguments(["Unselected public view"], [])
  ));
}