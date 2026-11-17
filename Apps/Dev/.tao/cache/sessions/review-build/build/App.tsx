import * as TR from '@tao/runtime/generated';
import * as Source0 from "./ts/packages/Kitchen Sink/Kitchen Sink";
import * as Source1 from "./ts/packages/Kitchen Sink/Modules";
import * as Source2 from "./ts/dependencies/tao/@ui/Views";
import * as Source3 from "./ts/packages/Kitchen Sink/Library/Demo";

TR.ModuleApplied("r1");
const _scope0 = TR.Scope() as Source0.Scope;
const _scope1 = TR.Scope() as Source1.Scope;
const _scope2 = TR.Scope() as Source2.Scope;
const _scope3 = TR.Scope() as Source3.Scope;
const _Modules = { "ts/packages/Kitchen Sink/Kitchen Sink.ts": _scope0,
"ts/packages/Kitchen Sink/Modules.ts": _scope1,
"ts/dependencies/tao/@ui/Views.ts": _scope2,
"ts/packages/Kitchen Sink/Library/Demo.ts": _scope3 };
Source0.bindAliases(_scope0, _Modules);
Source1.bindAliases(_scope1, _Modules);
Source2.bindAliases(_scope2, _Modules);
Source3.bindAliases(_scope3, _Modules);
Source0.bindDeclarations(_scope0);
Source1.bindDeclarations(_scope1);
Source2.bindDeclarations(_scope2);
Source3.bindDeclarations(_scope3);
Source0.initializeDefaultTitle(_scope0);
Source1.initializeModuleCaption(_scope1);

export default function App() {
  return TR.AppDeclaration(_scope0["RootView"], "r1");
}