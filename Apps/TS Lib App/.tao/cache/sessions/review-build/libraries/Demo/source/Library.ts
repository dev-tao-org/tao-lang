import * as TR from '@runtime';
import { createLibrary, createViewComponent } from '@tao/ts-api';
import type { ViewProps } from '@tao/ts-api';
import * as Source0 from "./source/Library";
import * as Source1 from "./source/DisabledPreview";
import * as Source2 from "./source/LanguageFeatures";
import * as Source3 from "./source/ScopeExamples";
import * as Source4 from "./source/ValueSnapshots";
import * as Source5 from "./tao/ui/Views";
import * as Source6 from "./source/cards/Card";
import * as Source7 from "./source/cards/Other";
import * as Source8 from "./source/cards/Publication";

const library = createLibrary(() => {
  const _scope0 = TR.Scope() as Source0.Scope;
  const _scope1 = TR.Scope() as Source1.Scope;
  const _scope2 = TR.Scope() as Source2.Scope;
  const _scope3 = TR.Scope() as Source3.Scope;
  const _scope4 = TR.Scope() as Source4.Scope;
  const _scope5 = TR.Scope() as Source5.Scope;
  const _scope6 = TR.Scope() as Source6.Scope;
  const _scope7 = TR.Scope() as Source7.Scope;
  const _scope8 = TR.Scope() as Source8.Scope;
  const _Modules = { "source/Library.ts": _scope0,
  "source/DisabledPreview.ts": _scope1,
  "source/LanguageFeatures.ts": _scope2,
  "source/ScopeExamples.ts": _scope3,
  "source/ValueSnapshots.ts": _scope4,
  "tao/ui/Views.ts": _scope5,
  "source/cards/Card.ts": _scope6,
  "source/cards/Other.ts": _scope7,
  "source/cards/Publication.ts": _scope8 };
  Source0.bindAliases(_scope0, _Modules);
  Source1.bindAliases(_scope1, _Modules);
  Source2.bindAliases(_scope2, _Modules);
  Source3.bindAliases(_scope3, _Modules);
  Source4.bindAliases(_scope4, _Modules);
  Source5.bindAliases(_scope5, _Modules);
  Source6.bindAliases(_scope6, _Modules);
  Source7.bindAliases(_scope7, _Modules);
  Source8.bindAliases(_scope8, _Modules);
  Source0.bindDeclarations(_scope0);
  Source1.bindDeclarations(_scope1);
  Source2.bindDeclarations(_scope2);
  Source3.bindDeclarations(_scope3);
  Source4.bindDeclarations(_scope4);
  Source5.bindDeclarations(_scope5);
  Source6.bindDeclarations(_scope6);
  Source7.bindDeclarations(_scope7);
  Source8.bindDeclarations(_scope8);
  Source2.initializeFileCaption(_scope2);
  Source2.initializeEscapedCaption(_scope2);
  return { "Greeting": _scope0["Greeting"], "Panel": _scope0["Panel"], "LanguageFeatures": _scope2["LanguageFeatures"], "ValueSnapshots": _scope4["ValueSnapshots"], "DisabledPreview": _scope1["DisabledPreview"], "Cards/Caption": _scope6["Caption"] };
});
export const Published0 = createViewComponent<ViewProps & { "First": string; "Second": string }>(library, "Greeting", ["First", "Second"]);
export const Published1 = createViewComponent<ViewProps & {  }>(library, "Panel", []);
export const Published2 = createViewComponent<ViewProps & { "Name": string }>(library, "LanguageFeatures", ["Name"]);
export const Published3 = createViewComponent<ViewProps & {  }>(library, "ValueSnapshots", []);
export const Published4 = createViewComponent<ViewProps & { "Locked": boolean }>(library, "DisabledPreview", ["Locked"]);
export const Published5 = createViewComponent<ViewProps & { "Value": string }>(library, "Cards/Caption", ["Value"]);
export default library;