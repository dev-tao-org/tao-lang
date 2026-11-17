import * as TR from '@tao/runtime/generated';
import Tao from '@tao/runtime/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./LanguageFeatures";
import { ForeignGreeting as _taoForeignView0 } from "../../../sidecars/1/src/ts/ForeignGreeting";

function useTaoInjectionLanguageFeatures$CapturedCaption_f61fcef90f44(Caption: string) {
  return <Tao.Text>{'Aliased capture: ' + Caption}</Tao.Text>
}
export function TaoView_LanguageFeatures$CapturedCaption_f61fcef90f44(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<Omit<ModuleScope, "Name" | "CapturedCaption"> & { readonly "Name": string; readonly "CapturedCaption": TR.View }, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionLanguageFeatures$CapturedCaption_f61fcef90f44(_Scope["Value"] as string));
}
export function TaoView_LanguageFeatures_f61fcef90f44(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Name" | "CapturedCaption"> & { readonly "Name": string; readonly "CapturedCaption": TR.View };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  const _Imported_FolderScope = TR.ScopeAliases<ModuleImports["FolderScope"]>(_Scope, { ["FolderScope"]: "FolderScope" });
  const _Imported_PackageScope = TR.ScopeAliases<ModuleImports["PackageScope"]>(_Scope, { ["PackageScope"]: "PackageScope" });
  const _Imported_ProjectScope = TR.ScopeAliases<ModuleImports["ProjectScope"]>(_Scope, { ["ProjectScope"]: "ProjectScope" });
  const _Imported_Caption = TR.ScopeAliases<ModuleImports["Caption"]>(_Scope, { ["Caption"]: "Caption" });
  const _Imported_AliasText = TR.ScopeAliases<ModuleImports["AliasText"]>(_Scope, { ["Text"]: "AliasText" });
  const _Imported_PackageCaption = TR.ScopeAliases<ModuleImports["PackageCaption"]>(_Scope, { ["Caption"]: "PackageCaption" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  const _Imported_Input = TR.ScopeAliases<ModuleImports["Input"]>(_Scope, { ["Input"]: "Input" });
  TR.LetDeclaration(_Scope, "CapturedCaption", TR.ViewDeclaration("CapturedCaption", ["Value"], TaoView_LanguageFeatures$CapturedCaption_f61fcef90f44, _Scope));
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["FileCaption"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_FolderScope["FolderScope"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_PackageScope["PackageScope"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_ProjectScope["ProjectScope"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Caption["Caption"],
        TR.ViewRenderArguments(["Package import"], [])
      ),
      TR.ViewRenderExpression(
        _Imported_AliasText["Text"],
        TR.ViewRenderArguments(["Tao alias"], [])
      ),
      TR.ViewRenderExpression(
        _Imported_PackageCaption["Caption"],
        TR.ViewRenderArguments(["Aliased package import"], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Col["Col"],
        TR.ViewRenderArguments([], TR.ViewRenderBlock(_Scope, (_Scope, _Children) => {
          TR.LetDeclaration(_Scope, "FileCaption", "Nested lexical text");
          _Children.push(TR.ViewRenderExpression(
            _Imported_Text["Text"],
            TR.ViewRenderArguments([_Scope["FileCaption"]], [])
          ));
        }))
      ),
      TR.ViewRenderExpression(
        _Scope["CapturedCaption"],
        TR.ViewRenderArguments([_Scope["Name"]], [])
      ),
      TR.ViewRenderExpression(
        _Scope["ForeignGreeting"],
        TR.ViewRenderArguments([_Scope["Name"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Input["Input"],
        TR.ViewRenderArguments(["Library input"], [], "libraryInput")
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["EscapedCaption"]], [])
      )
    ])
  ));
}