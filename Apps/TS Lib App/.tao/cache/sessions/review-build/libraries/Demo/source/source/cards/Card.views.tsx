import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Card";


export function TaoView_Caption_393517ce5f13(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Text["Text"],
    TR.ViewRenderArguments([_Scope["Value"]], [])
  ));
}