import * as TR from '@tao/runtime/generated';
import Tao from '@tao/runtime/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Kitchen Sink";
import { SidecarGreeting as _taoForeignView0 } from "/Users/ro/.codex/worktrees/2c4e/tao-lang/Apps/Dev/.tao/cache/sessions/review-build/foreign-views/645bdccd64217ceedfd5856ef9d04e12f2a4d0156c5778577a912ee207ed9e6f/modules/08f1100fb307a4f1/Kitchen Sink/SidecarGreeting.tsx";

export function TaoView_RootView$PrivateGreeting_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Title" | "PrivateGreeting"> & { readonly "Title": string; readonly "PrivateGreeting": TR.View };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Text["Text"],
    TR.ViewRenderArguments(["Private nested view"], [])
  ));
}
export function TaoView_RootView_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Title" | "PrivateGreeting"> & { readonly "Title": string; readonly "PrivateGreeting": TR.View };
  const _Imported_LibraryGreeting = TR.ScopeAliases<ModuleImports["LibraryGreeting"]>(_Scope, { ["LibraryGreeting"]: "LibraryGreeting" });
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  const _Imported_Modules$ModuleCaption = TR.ScopeAliases<ModuleImports["Modules.ModuleCaption"]>(_Scope, { ["ModuleCaption"]: "Modules.ModuleCaption" });
  const _Imported_ModuleCaption = TR.ScopeAliases<ModuleImports["ModuleCaption"]>(_Scope, { ["ModuleCaption"]: "ModuleCaption" });
  const _Imported_ImportedCaption = TR.ScopeAliases<ModuleImports["ImportedCaption"]>(_Scope, { ["ModuleCaption"]: "ImportedCaption" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  const _Imported_Input = TR.ScopeAliases<ModuleImports["Input"]>(_Scope, { ["Input"]: "Input" });
  const _Imported_Caption = TR.ScopeAliases<ModuleImports["Caption"]>(_Scope, { ["Text"]: "Caption" });
  const _Imported_UI$Text = TR.ScopeAliases<ModuleImports["UI.Text"]>(_Scope, { ["Text"]: "UI.Text" });
  const _Imported_Row = TR.ScopeAliases<ModuleImports["Row"]>(_Scope, { ["Row"]: "Row" });
  TR.LetDeclaration(_Scope, "PrivateGreeting", TR.ViewDeclaration("PrivateGreeting", [], TaoView_RootView$PrivateGreeting_857a47b01222, _Scope));
  TR.LetDeclaration(_Scope, "Title", _Scope["DefaultTitle"]);
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Scope["Heading"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Scope["PrivateGreeting"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_LibraryGreeting["LibraryGreeting"],
        TR.ViewRenderArguments(["Typed", "TypeScript props"], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["Title"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Imported_Modules$ModuleCaption["ModuleCaption"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Imported_ModuleCaption["ModuleCaption"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Imported_ImportedCaption["ModuleCaption"]], [])
      ),
      TR.ViewRenderExpression(
        _Scope["SidecarGreeting"],
        TR.ViewRenderArguments(["Validated TypeScript sidecar"], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Col["Col"],
        TR.ViewRenderArguments([], TR.ViewRenderBlock(_Scope, (_Scope, _Children) => {
          TR.LetDeclaration(_Scope, "Title", "Nested lexical scope");
          _Children.push(TR.ViewRenderExpression(
            _Imported_Text["Text"],
            TR.ViewRenderArguments([_Scope["Title"]], [])
          ));
        }))
      ),
      TR.ViewRenderExpression(
        _Imported_Input["Input"],
        TR.ViewRenderArguments(["Original"], [], "editable")
      ),
      TR.ViewRenderExpression(
        _Scope["SaveButton"],
        TR.ViewRenderArguments([], [], "save")
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments(["Text: \"quotes\", a backslash \\, Unicode ☺\nand a new line"], [])
      ),
      TR.ViewRenderExpression(
        _Scope["Panel"],
        TR.ViewRenderArguments(["Nested children and aliased captures"], [
          TR.ViewRenderExpression(
            _Scope["Pair"],
            TR.ViewRenderArguments(["First parameter", "Second parameter"], [])
          ),
          TR.ViewRenderExpression(
            _Imported_Row["Row"],
            TR.ViewRenderArguments([], [
              TR.ViewRenderExpression(
                _Imported_Caption["Text"],
                TR.ViewRenderArguments(["Left"], [])
              ),
              TR.ViewRenderExpression(
                _Imported_UI$Text["Text"],
                TR.ViewRenderArguments(["Right"], [])
              )
            ])
          )
        ])
      )
    ])
  ));
}

export function TaoView_Pair_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "First" | "Second" | "FirstCaption"> & { readonly "First": string; readonly "Second": string; readonly "FirstCaption": string };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  TR.LetDeclaration(_Scope, "FirstCaption", _Scope["First"]);
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["FirstCaption"]], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["Second"]], [])
      )
    ])
  ));
}

function useTaoInjectionPanel_857a47b01222(Caption: string, Children: TR.ViewComponentProps['children']) {
  return (
        <Tao.View style={{ padding: 12, borderWidth: 1 }}>
          <Tao.Text>{Caption}</Tao.Text>
          {Children}
        </Tao.View>
      )
}
export function TaoView_Panel_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Title"> & { readonly "Title": string };

  return TR.finishViewRender(_Render, useTaoInjectionPanel_857a47b01222(_Scope["Title"] as string, _Render.children));
}

function useTaoInjectionHeading_857a47b01222() {
  return <Tao.Text style={{ fontSize: 24 }}>Kitchen Sink</Tao.Text>
}
export function TaoView_Heading_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionHeading_857a47b01222());
}

function useTaoInjectionSaveButton_857a47b01222() {
  const status = Tao.useWritable(() => ({ captions: ['Save'] }))
      const snapshot = Tao.useValue(status)
      return (
        <Tao.Pressable onPress={() => status.update({ captions: ['Saved'] })}>
          <Tao.Text>{snapshot.captions[0]}</Tao.Text>
        </Tao.Pressable>
      )
}
export function TaoView_SaveButton_857a47b01222(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionSaveButton_857a47b01222());
}