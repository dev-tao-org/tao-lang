// 7-runtime/runtime-src/client/Bridge_react/Bridge_react.ts
import React from "react";
var Bridge_react_default = React;

// shared/shared-src/universal/Characters.ts
var NewlineCharacter = `
`;
var NewlineCharacterCode = NewlineCharacter.charCodeAt(0);
// shared/shared-src/universal/Errors/Base.ts
class BaseTaoError extends Error {
  details;
  cause;
  messageForUser;
  constructor(name, messageForUser, opts = {}) {
    super(messageForUser);
    taoErrors.add(this);
    this.name = name;
    this.messageForUser = messageForUser;
    this.cause = opts.cause;
    this.details = opts.details;
  }
}
function isTaoError(error) {
  return typeof error === "object" && error !== null && taoErrors.has(error);
}
var taoErrors = new WeakSet;
// shared/shared-src/universal/TryCatch.ts
function Try(action, options = {}) {
  const completed = continueWith(capture(action), (original) => {
    const handled = !original.ok && options.catch ? capture(() => options.catch(original.thrown)) : original;
    return continueWith(handled, (result) => {
      if (!options.finally) {
        return result;
      }
      return continueWith(capture(() => options.finally(original.ok ? undefined : original.thrown, original.ok ? undefined : original.error)), (finalized) => finalized.ok ? result : finalized);
    });
  });
  return isNativePromise(completed) ? completed.then(unwrap) : unwrap(completed);
}
((Try2) => {
  function WithDefault(defaultValue, action) {
    return Try(action, {
      catch: () => defaultValue
    });
  }
  Try2.WithDefault = WithDefault;
})(Try ||= {});
function capture(action) {
  try {
    const value = action();
    if (isPromiseLike(value)) {
      return Promise.resolve(value).then((value) => ({ ok: true, value }), failure);
    }
    return { ok: true, value };
  } catch (thrown) {
    return failure(thrown);
  }
}
function failure(thrown) {
  return { ok: false, thrown, error: fromUnknown(thrown) };
}
function isPromiseLike(value) {
  if (value === null) {
    return false;
  }
  const canHavePromiseMethods = typeof value === "object" || typeof value === "function";
  return canHavePromiseMethods && typeof value.then === "function";
}
function continueWith(result, next) {
  return isNativePromise(result) ? result.then(next) : next(result);
}
function isNativePromise(value) {
  return value instanceof Promise;
}
function unwrap(outcome) {
  if (!outcome.ok) {
    Throw(outcome.error);
  }
  return outcome.value;
}
// shared/shared-src/universal/Errors/Values.ts
class UserInputError extends BaseTaoError {
  name = "UserInputError";
  constructor(messageForUser, details, opts = {}) {
    super("UserInputError", messageForUser, { ...opts, details });
  }
}

class UnexpectedBehaviorError extends BaseTaoError {
  name = "UnexpectedBehaviorError";
  constructor(messageForUser = unexpectedErrorMessage, opts = {}) {
    super("UnexpectedBehaviorError", messageForUser, opts);
  }
}
var unexpectedErrorMessage = "Something went wrong.";

// shared/shared-src/universal/Errors/external/Normalize.ts
function fromUnknown(error, details) {
  if (isTaoError(error)) {
    return error;
  }
  return new UnexpectedBehaviorError(unexpectedErrorMessage, { cause: error, details });
}
// shared/shared-src/universal/Errors/Throw.ts
function Throw(error) {
  throw fromUnknown(error);
}
function ThrowUserInput(messageForUser, details, opts) {
  throw new UserInputError(messageForUser, details, opts);
}
function ThrowShouldNeverHappen(messageForUser, opts) {
  throw new UnexpectedBehaviorError(messageForUser, opts);
}
// shared/shared-src/universal/Styles.ts
function declarations(styleDeclarations) {
  return Object.entries(styleDeclarations).map(([property, value]) => `${property}:${value}`).join(";");
}
// shared/shared-src/universal/Switch_TypeSafe.ts
var Switch_TypeSafe_default = Object.assign(Switch, {
  kind: SwitchKind,
  kindMaybe: SwitchKindMaybe,
  nothing,
  on: SwitchOn,
  property: SwitchProperty,
  type: SwitchType,
  typeMaybe: SwitchTypeMaybe
});
function Switch(input, handlers) {
  const key = input === undefined ? "undefined" : input;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled switch value: ${String(input)}`);
  }
  return handler(input);
}
function SwitchType(item, handlers) {
  const key = item.$type;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled item type: ${String(key)}`);
  }
  return handler(item);
}
function SwitchKind(item, handlers) {
  const key = item.kind;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled item kind: ${String(key)}`);
  }
  return handler(item);
}
function SwitchTypeMaybe(item, handlers) {
  const key = item === undefined ? "undefined" : item.$type;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled item type: ${String(key)}`);
  }
  return handler(item);
}
function SwitchKindMaybe(item, handlers) {
  const key = item === undefined ? "undefined" : item.kind;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled item kind: ${String(key)}`);
  }
  return handler(item);
}
function SwitchProperty(item, propertyName, handlers) {
  const propertyValue = item[propertyName];
  const key = propertyValue === undefined ? "undefined" : propertyValue;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled property value: ${String(propertyValue)}`);
  }
  return handler(propertyValue);
}
function SwitchOn(item, propertyName, handlers) {
  const propertyValue = item[propertyName];
  const key = propertyValue === undefined ? "undefined" : propertyValue;
  const handler = ownHandler(handlers, key);
  if (!handler) {
    ThrowShouldNeverHappen(`Unhandled property value: ${String(propertyValue)}`);
  }
  return handler(item);
}
function ownHandler(handlers, key) {
  return Object.hasOwn(handlers, key) ? handlers[key] : undefined;
}
function nothing() {}
// shared/shared-src/universal/Time.ts
var clockIdentity = `runtime:${performance.timeOrigin}:${Math.random().toString(36).slice(2)}`;
function nowMs() {
  return performance.now();
}
function timestampMs() {
  return performance.timeOrigin + performance.now();
}
function scheduleMicrotask(action) {
  let active = true;
  queueMicrotask(() => {
    if (active) {
      action();
    }
  });
  return () => {
    active = false;
  };
}
// shared/shared-src/universal/Timings.ts
var entry = Symbol("timing entry");
var action = Symbol("timing operation");
// shared/shared-src/os/bridges/Bridge_browser/Bridge_browser.ts
var crypto = globalThis.crypto;
var performance2 = globalThis.performance;
var fetch = globalThis.fetch.bind(globalThis);
var WebSocket = globalThis.WebSocket;
var EventSource = globalThis.EventSource;
var Response = globalThis.Response;
var Request = globalThis.Request;
var ReadableStream = globalThis.ReadableStream;
var AbortController = globalThis.AbortController;
var URL = globalThis.URL;
var URLSearchParams = globalThis.URLSearchParams;
var TextDecoder = globalThis.TextDecoder;
var TextEncoder = globalThis.TextEncoder;
function hasWindow() {
  return typeof window !== "undefined";
}
function getBrowserWindow() {
  return window;
}
function hasDocument() {
  return typeof document !== "undefined";
}
function getBrowserDocument() {
  return document;
}

// shared/shared-src/os/preview/PreviewErrors.ts
function showPreviewError(message, onReload) {
  if (!hasDocument()) {
    return;
  }
  const panel = getBrowserDocument().getElementById("tao-preview-error") ?? createErrorPanel();
  const text = panel.querySelector("pre");
  panel.querySelector("button").onclick = onReload;
  text.textContent = message;
  panel.hidden = false;
}
function clearPreviewError() {
  const panel = !hasDocument() ? null : getBrowserDocument().getElementById("tao-preview-error");
  if (panel) {
    panel.hidden = true;
  }
}
function createErrorPanel() {
  const panel = getBrowserDocument().createElement("aside");
  panel.id = "tao-preview-error";
  panel.setAttribute("role", "alert");
  panel.style.cssText = declarations({
    position: "fixed",
    inset: "12px",
    "z-index": "2147483647",
    background: "#292020",
    color: "#fff",
    padding: "16px",
    overflow: "auto",
    font: "14px system-ui",
    border: "1px solid #b66"
  });
  const text = getBrowserDocument().createElement("pre");
  text.style.cssText = declarations({ "white-space": "pre-wrap", "overflow-wrap": "anywhere" });
  const reload = getBrowserDocument().createElement("button");
  reload.textContent = "Reload";
  panel.append(text, reload);
  (getBrowserDocument().body ?? getBrowserDocument().documentElement).append(panel);
  return panel;
}

// shared/shared-src/os/preview/PreviewPlatform.ts
function reportPreviewError(kind, message, revision) {
  showPreviewError(message, () => {
    if (previewState()) {
      postPreviewMessage({ type: "tao.preview-reload" });
    } else {
      getBrowserWindow().location.reload();
    }
  });
  postPreviewMessage({ type: "tao.preview-error", kind, message, revision });
}
function reportPreviewEvent(type, revision, metroDeltaModules) {
  const state = previewState();
  if (!state?.revision || revision && revision !== state.revision) {
    return;
  }
  if (type === "tao.preview-applied") {
    clearPreviewError();
  }
  getBrowserWindow().parent.postMessage({
    type,
    sessionId: state.sessionId,
    frameId: state.frameId,
    bootId: state.bootId,
    revision: revision ?? state.revision,
    timestampMs: timestampMs(),
    localTime: nowMs(),
    timeOrigin: performance2.timeOrigin,
    moduleAppliedAtMs: state.moduleAppliedAtMs,
    metroDeltaModules,
    timings: [...state.timings]
  }, state.parentOrigin);
}
function previewTiming(timing) {
  const state = previewState();
  if (state && state.timings.length < 1000) {
    state.timings.push(timing);
  }
}
function previewState() {
  if (!hasWindow()) {
    return;
  }
  const host = getBrowserWindow();
  if (!host.parent || host.parent === getBrowserWindow()) {
    return;
  }
  if (host.__taoPreview) {
    return host.__taoPreview;
  }
  const search = host.location?.search;
  if (!search) {
    return;
  }
  const query = new URLSearchParams(search);
  const sessionId = query.get("sessionId");
  const frameId = query.get("frameId");
  const parentOrigin = query.get("parentOrigin");
  if (!sessionId || !frameId || !parentOrigin) {
    return;
  }
  host.__taoPreview = {
    sessionId,
    frameId,
    parentOrigin,
    bootId: query.get("bootId") ?? crypto.randomUUID(),
    timings: []
  };
  return host.__taoPreview;
}
function postPreviewMessage(message) {
  const state = previewState();
  if (state) {
    getBrowserWindow().parent.postMessage({ ...message, sessionId: state.sessionId, frameId: state.frameId, bootId: state.bootId }, state.parentOrigin);
  }
}

// 7-runtime/runtime-src/client/Preview.ts
function reportRenderError(revision, error) {
  reportPreviewError("runtime-error", String(error), revision);
}
var options = {
  onApplied(revision) {
    reportPreviewEvent("tao.preview-applied", revision);
  },
  observer: { now: nowMs, onTiming: previewTiming }
};

// 7-runtime/runtime-src/client/Scope.ts
function Scope(parent) {
  return Object.create(parent ?? null);
}
function LetDeclaration(scope, name, value) {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    ThrowUserInput(`Name "${name}" is already defined`);
  }
  Object.defineProperty(scope, name, { value, enumerable: true });
}
function AliasBinding(scope, name, resolve) {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    ThrowUserInput(`Name "${name}" is already defined`);
  }
  Object.defineProperty(scope, name, { get: resolve, enumerable: true });
}
function ScopeAliases(scope, names) {
  const aliasesScope = Scope();
  for (const [name, target] of Object.entries(names)) {
    AliasBinding(aliasesScope, name, () => Name(scope, target));
  }
  return aliasesScope;
}
function Name(scope, name) {
  if (!hasScopeBinding(scope, name)) {
    ThrowUserInput(`Undefined name "${name}"`);
  }
  return scope[name];
}
function ViewRenderBlock(parent, body) {
  const children = [];
  body(Scope(parent), children);
  return children;
}
function hasScopeBinding(scope, name) {
  return name in scope;
}

// 7-runtime/runtime-src/client/View.ts
function ViewDeclaration(name, parameters, render, scope = Scope()) {
  return { name, parameters: [...parameters], render, scope, [viewMarker]: true };
}
function ViewRenderArguments(values = [], inputChildren = [], testID) {
  const children = inputChildren.map((child, index) => Bridge_react_default.isValidElement(child) ? Bridge_react_default.cloneElement(child, { key: child.key ?? index }) : child);
  return { values, testID, children };
}
function ViewRenderExpression(candidate, args, observer) {
  const body = Bridge_react_default.createElement(ViewBody, { candidate, args, key: args.testID });
  return observer ? ProvideRuntimeObserver(observer, body) : body;
}
function beginViewRender(props) {
  const startedAt = props.observer?.now();
  return { ...props, scope: Scope(props.scope), startedAt };
}
function finishViewRender(context, result) {
  observe(context.observer, "render", context.startedAt);
  return applyTestID(result, context.testID);
}
function ProvideRuntimeObserver(observer, children) {
  return Bridge_react_default.createElement(RuntimeObserverContext.Provider, { value: observer }, children);
}
var viewMarker = Symbol("TaoView");
var RuntimeObserverContext = Bridge_react_default.createContext(undefined);
function ViewBody({ candidate, args, testID }) {
  const view = requireView(candidate);
  const observer = Bridge_react_default.useContext(RuntimeObserverContext);
  const bindingStartedAt = observer?.now();
  const scope = bindValues(view, args);
  observe(observer, "bind", bindingStartedAt);
  const componentProps = { view, scope, children: args.children, testID: args.testID ?? testID, observer };
  return Bridge_react_default.createElement(view.render, componentProps);
}
function applyTestID(result, testID) {
  if (testID === undefined || !Bridge_react_default.isValidElement(result)) {
    return result;
  }
  return Bridge_react_default.cloneElement(result, { testID });
}
function bindValues(view, args) {
  const missingIndex = view.parameters.findIndex((_parameter, index) => index >= args.values.length);
  if (missingIndex >= 0) {
    ThrowUserInput(`${view.name} is missing required argument "${view.parameters[missingIndex]}"`);
  }
  const scope = Scope(view.scope);
  for (const [index, parameter] of view.parameters.entries()) {
    LetDeclaration(scope, parameter, args.values[index]);
  }
  return scope;
}
function requireView(value) {
  if (!isView(value)) {
    ThrowUserInput("Cannot render an unknown Tao view.");
  }
  return value;
}
function isView(value) {
  return typeof value === "object" && value !== null && viewMarker in value;
}
function observe(observer, phase, startedAt) {
  if (!observer || startedAt === undefined) {
    return;
  }
  observer.onTiming({ phase, durationMs: observer.now() - startedAt });
}

// 7-runtime/runtime-src/client/App.ts
class PreviewErrorBoundary extends Bridge_react_default.Component {
  state = { revision: this.props.revision, failed: false };
  static getDerivedStateFromProps(props, state) {
    return props.revision === state.revision ? null : { revision: props.revision, failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    reportRenderError(this.props.revision, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
// 7-runtime/runtime-src/client/ForeignView.ts
function ForeignView(name, parameters, component, scope = Scope()) {
  const descriptor = ViewDeclaration(name, parameters, ForeignViewBody, scope);
  return { ...descriptor, foreignComponent: component };
}
function ForeignViewBody(props) {
  const context = beginViewRender(props);
  const component = context.view.foreignComponent;
  if (!component) {
    ThrowShouldNeverHappen(`Foreign Tao view "${context.view.name}" has no component.`);
  }
  const valueProps = Object.fromEntries(context.view.parameters.map((parameter) => [parameter, Name(context.scope, parameter)]));
  const testIDProps = context.testID === undefined ? {} : { testID: context.testID };
  const element = Bridge_react_default.createElement(component, {
    ...valueProps,
    ...testIDProps
  }, ...context.children);
  return finishViewRender(context, element);
}
// ts-api/ts-api-src/Library.tsx
function createLibrary(initialize) {
  const owner = {};
  const context = Bridge_react_default.createContext(undefined);
  return {
    instantiate() {
      let disposed = false;
      const views = initialize();
      return {
        views,
        owner,
        get disposed() {
          return disposed;
        },
        dispose() {
          disposed = true;
        }
      };
    },
    Provider({ instance, children }) {
      requireMatchingInstance(instance, owner);
      return Bridge_react_default.createElement(context.Provider, { value: instance }, children);
    },
    useInstance() {
      const instance = Bridge_react_default.useContext(context);
      if (!instance) {
        ThrowUserInput("A published Tao view requires its library.Provider.");
      }
      requireMatchingInstance(instance, owner);
      return instance;
    }
  };
}
function requireMatchingInstance(instance, owner) {
  if (instance.owner !== owner) {
    ThrowUserInput("A Tao library provider received an instance from a different library.");
  }
  if (instance.disposed) {
    ThrowUserInput("A disposed Tao library instance cannot render.");
  }
}
// 7-runtime/runtime-src/client/Appearance.ts
var DefaultAppearance = {
  background: "#252525",
  foreground: "#e8e6e3",
  border: "#b8b4ae"
};
// 7-runtime/runtime-src/client/Bridge_preact-signals-core.ts
import * as Preact from "@preact/signals-core";
var Bridge_preact_signals_core_default = Preact;

// 7-runtime/runtime-src/client/ReactiveBatch.ts
function runSynchronousReactiveBatch(perform) {
  let result;
  Bridge_preact_signals_core_default.batch(() => {
    result = perform();
  });
  if (isThenable(result)) {
    ThrowUserInput("Reactive batches must finish synchronously; do not return a Promise.");
  }
  return result;
}
function isThenable(value) {
  if (!isObjectOrFunction(value)) {
    return false;
  }
  return typeof value.then === "function";
}
function isObjectOrFunction(value) {
  return typeof value === "object" && value !== null || typeof value === "function";
}

// 7-runtime/runtime-src/client/ValueSnapshots.ts
function registerValueCapability(capability) {
  valueCapabilities.add(capability);
  return capability;
}
function takeValueSnapshot(value) {
  return snapshotValue(value);
}
function areValueSnapshotsEqual(left, right) {
  return compareSnapshotValues(left, right);
}
var ownedSnapshots = new WeakSet;
var valueCapabilities = new WeakSet;
function snapshotValue(value) {
  if (!isObject(value)) {
    return value;
  }
  const prototype = findCollectionPrototype(value);
  if (prototype === undefined) {
    return value;
  }
  return copyCollection(value, prototype);
}
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function findCollectionPrototype(value) {
  if (ownedSnapshots.has(value) || valueCapabilities.has(value)) {
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  return isOrdinaryCollection(value, prototype) ? prototype : undefined;
}
function isOrdinaryCollection(value, prototype) {
  return Array.isArray(value) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null;
}
function copyCollection(source, prototype) {
  const traversal = { copies: new Map, pending: [] };
  const snapshot = reuseOrBeginCopy(source, prototype, traversal);
  const { copies, pending } = traversal;
  while (pending.length > 0) {
    const copy = pending[pending.length - 1];
    const name = copy.fields[copy.nextField];
    if (name === undefined) {
      Object.freeze(copy.result);
      ownedSnapshots.add(copy.result);
      copies.set(copy.source, copy.result);
      pending.pop();
      continue;
    }
    copy.nextField += 1;
    if (copy.listLength !== undefined) {
      if (name === "length") {
        continue;
      }
      requireListIndex(name, copy.listLength);
    }
    const field = requireDataField(copy.source, name);
    const value = copyFieldValue(field, traversal);
    Object.defineProperty(copy.result, name, { value, enumerable: true });
  }
  return snapshot;
}
function copyFieldValue(value, traversal) {
  if (!isObject(value)) {
    return value;
  }
  const prototype = findCollectionPrototype(value);
  return prototype === undefined ? value : reuseOrBeginCopy(value, prototype, traversal);
}
function reuseOrBeginCopy(source, prototype, traversal) {
  requireStringFields(source);
  const { copies, pending } = traversal;
  const existing = copies.get(source);
  if (existing !== undefined) {
    return existing;
  }
  if (copies.has(source)) {
    return ThrowUserInput("Tao value snapshots require acyclic lists and records.");
  }
  copies.set(source, undefined);
  const listLength = Array.isArray(source) ? source.length : undefined;
  const result = listLength === undefined ? Object.create(prototype) : new Array(listLength);
  const fields = Object.getOwnPropertyNames(source);
  pending.push({ source, result, listLength, fields, nextField: 0 });
  return result;
}
function requireStringFields(value) {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    ThrowUserInput("Tao collection snapshots require string field names.");
  }
}
function requireListIndex(name, length) {
  const index = Number(name);
  const isIntegerKey = Number.isInteger(index) && String(index) === name;
  const isInBounds = index >= 0 && index < length;
  if (!isIntegerKey || !isInBounds) {
    ThrowUserInput("Tao list snapshots require indexed data fields.");
  }
}
function requireDataField(source, name) {
  const field = Object.getOwnPropertyDescriptor(source, name);
  if (!field?.enumerable || !Object.hasOwn(field, "value")) {
    return ThrowUserInput("Tao value snapshots require enumerable data fields.");
  }
  return field.value;
}
function compareSnapshotValues(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  if (!isOwnedSnapshot(left) || !isOwnedSnapshot(right)) {
    return false;
  }
  const comparison = { pairs: new Map, pending: [] };
  if (!queueCollectionComparison(left, right, comparison)) {
    return false;
  }
  while (comparison.pending.length > 0) {
    const frame = comparison.pending[comparison.pending.length - 1];
    const name = frame.fields[frame.nextField];
    if (name === undefined) {
      rememberMatchedPair(frame, comparison.pairs);
      comparison.pending.pop();
      continue;
    }
    frame.nextField += 1;
    if (!compareCollectionField(frame, name, comparison)) {
      return false;
    }
  }
  return true;
}
function isOwnedSnapshot(value) {
  return isObject(value) && ownedSnapshots.has(value);
}
function rememberMatchedPair(frame, pairs) {
  const rights = pairs.get(frame.left) ?? new Set;
  rights.add(frame.right);
  pairs.set(frame.left, rights);
}
function compareCollectionField(frame, name, comparison) {
  if (!Object.hasOwn(frame.right, name)) {
    return false;
  }
  const left = Reflect.get(frame.left, name);
  const right = Reflect.get(frame.right, name);
  if (Object.is(left, right)) {
    return true;
  }
  const bothOwned = isOwnedSnapshot(left) && isOwnedSnapshot(right);
  return bothOwned && queueCollectionComparison(left, right, comparison);
}
function queueCollectionComparison(left, right, comparison) {
  const matchedRights = comparison.pairs.get(left);
  if (matchedRights?.has(right)) {
    return true;
  }
  if (!haveMatchingCollectionShape(left, right)) {
    return false;
  }
  const fields = Object.keys(left);
  if (fields.length !== Object.keys(right).length) {
    return false;
  }
  comparison.pending.push({ left, right, fields, nextField: 0 });
  return true;
}
function haveMatchingCollectionShape(left, right) {
  return Array.isArray(left) ? Array.isArray(right) && left.length === right.length : !Array.isArray(right);
}

// 7-runtime/runtime-src/client/ReactiveValues.ts
function encodeReactiveValue(value, previous) {
  if (typeof value !== "number") {
    const isObject = typeof value === "object" && value !== null;
    return isObject && areValueSnapshotsEqual(value, previous) ? previous : value;
  }
  if (Object.is(value, -0)) {
    return NegativeZero;
  }
  if (Number.isNaN(value)) {
    return NaNValue;
  }
  return value;
}
function decodeReactiveValue(value) {
  if (value === NegativeZero) {
    return -0;
  }
  if (value === NaNValue) {
    return Number.NaN;
  }
  return value;
}
var NegativeZero = Object.freeze({ value: "-0" });
var NaNValue = Object.freeze({ value: "NaN" });

// 7-runtime/runtime-src/client/ReactiveEngine.ts
function createReactiveEngine(options = {}) {
  return buildEngine({
    strategy: options.strategy ?? "native-lazy",
    scheduleDelivery: options.scheduleDelivery ?? ((deliver) => deliver()),
    allStops: new Set,
    pending: [],
    disposed: false,
    evaluationDepth: 0,
    deliveryChainCount: 0,
    cancelDeliveryChainReset: undefined,
    activeDelivery: undefined,
    deliveryScheduled: false,
    flushingDelivery: false
  });
}
function useWritable(initializer) {
  const [source] = Bridge_react_default.useState(() => defaultEngine.createWritable(initializer()));
  return source;
}
function useComputed(evaluate, stableInputs) {
  return Bridge_react_default.useMemo(() => defaultEngine.createComputed(evaluate), stableInputs);
}
function useValue(expression) {
  const subscribe = Bridge_react_default.useMemo(() => (notify) => {
    const observation = expression.observe(() => notify());
    return () => observation.unobserve();
  }, [expression]);
  const snapshot = Bridge_react_default.useMemo(() => {
    const cached = expression;
    return cached.snapshot ?? (() => expression.jsValue());
  }, [expression]);
  return Bridge_react_default.useSyncExternalStore(subscribe, snapshot, snapshot);
}
function batch(perform) {
  return defaultEngine.batch(perform);
}
var MaxReentrantDeliveries = 100;
var defaultEngine = createReactiveEngine();
function buildEngine(state) {
  return {
    createWritable: (initial) => createWritable(state, initial),
    createComputed(evaluate) {
      assertActive(state);
      return createExpression(state, () => takeValueSnapshot(evaluate()));
    },
    createConstant(value) {
      assertActive(state);
      const snapshot = takeValueSnapshot(value);
      return createExpression(state, () => snapshot);
    },
    batch(perform) {
      assertActive(state);
      return runSynchronousReactiveBatch(perform);
    },
    dispose: () => disposeEngine(state)
  };
}
function createNode(state, evaluate) {
  let previous;
  const value = Bridge_preact_signals_core_default.computed(() => {
    previous = evaluateNode(state, evaluate, previous);
    return previous;
  });
  return { value, evaluate };
}
function createExpression(state, evaluate) {
  const node = createNode(state, evaluate);
  const expression = expressionFor(state, node);
  return registerValueCapability(expression);
}
function expressionFor(state, node) {
  return {
    jsValue: () => readNode(state, node),
    observe: (receive) => observeNode(state, node, receive),
    snapshot: () => decodeReactiveValue(node.value.value)
  };
}
function readNode(state, node) {
  assertActive(state);
  return state.strategy === "uncached-public-read" && state.evaluationDepth === 0 ? node.evaluate() : decodeReactiveValue(node.value.value);
}
function evaluateNode(state, evaluate, previous) {
  state.evaluationDepth += 1;
  return Try(() => encodeReactiveValue(evaluate(), previous), {
    finally() {
      state.evaluationDepth -= 1;
    }
  });
}
function observeNode(state, node, receive) {
  assertActive(state);
  let active = true;
  let deliveryPending = false;
  let pendingValue = decodeReactiveValue(node.value.value);
  let lastDelivered = pendingValue;
  const stopEffect = Bridge_preact_signals_core_default.effect(() => watchNode(state, node, (value) => {
    if (!active) {
      return;
    }
    pendingValue = value;
    if (deliveryPending || areValueSnapshotsEqual(lastDelivered, pendingValue)) {
      return;
    }
    deliveryPending = true;
    queueDelivery(state, () => {
      deliveryPending = false;
      if (active && !areValueSnapshotsEqual(lastDelivered, pendingValue)) {
        lastDelivered = pendingValue;
        deliverValue(state, receive, lastDelivered, stop);
      }
    });
  }));
  const stop = () => {
    if (!active) {
      return;
    }
    active = false;
    stopEffect();
    state.allStops.delete(stop);
  };
  state.allStops.add(stop);
  state.activeDelivery?.createdStops.add(stop);
  Try(() => deliverValue(state, receive, lastDelivered, stop), {
    catch(thrown) {
      stop();
      return Throw(thrown);
    }
  });
  return registerValueCapability({ unobserve: stop });
}
function watchNode(state, node, changed) {
  assertActive(state);
  changed(decodeReactiveValue(node.value.value));
}
function deliverValue(state, receive, value, stop) {
  const parent = state.activeDelivery;
  state.activeDelivery = { stop, createdStops: new Set };
  Try(() => Bridge_preact_signals_core_default.untracked(() => receive(value)), {
    finally() {
      state.activeDelivery = parent;
    }
  });
}
function scheduleDeliveryChainReset(state) {
  state.cancelDeliveryChainReset?.();
  state.cancelDeliveryChainReset = scheduleMicrotask(() => resetDeliveryChain(state));
}
function resetDeliveryChain(state) {
  state.cancelDeliveryChainReset?.();
  state.cancelDeliveryChainReset = undefined;
  state.deliveryChainCount = 0;
}
function queueDelivery(state, deliver) {
  state.pending.push(deliver);
  if (state.deliveryScheduled || state.flushingDelivery) {
    return;
  }
  state.deliveryScheduled = true;
  state.scheduleDelivery(() => {
    if (!state.disposed) {
      flushDelivery(state);
    }
  });
}
function flushDelivery(state) {
  state.deliveryScheduled = false;
  state.flushingDelivery = true;
  let failure;
  Try(() => {
    while (state.pending.length > 0) {
      const current = state.pending;
      state.pending = [];
      Bridge_preact_signals_core_default.batch(() => {
        for (const deliver of current) {
          Try(deliver, {
            catch: () => {
              return;
            },
            finally(_thrown, error) {
              failure ??= error;
            }
          });
        }
      });
    }
  }, {
    finally() {
      state.flushingDelivery = false;
    }
  });
  if (failure) {
    Throw(failure);
  }
}
function createWritable(state, initial) {
  assertActive(state);
  const snapshot = takeValueSnapshot(initial);
  const source = Bridge_preact_signals_core_default.signal(encodeReactiveValue(snapshot));
  const node = createNode(state, () => decodeReactiveValue(source.value));
  return registerValueCapability({
    ...expressionFor(state, node),
    update: (value) => updateSource(state, source, value)
  });
}
function updateSource(state, source, value) {
  assertActive(state);
  const snapshot = takeValueSnapshot(value);
  const previous = source.peek();
  const next = encodeReactiveValue(snapshot, previous);
  if (Object.is(next, previous)) {
    return;
  }
  requireBoundedFeedback(state);
  Bridge_preact_signals_core_default.batch(() => {
    source.value = next;
  });
}
function requireBoundedFeedback(state) {
  const delivery = state.activeDelivery;
  if (!delivery) {
    resetDeliveryChain(state);
    return;
  }
  state.deliveryChainCount += 1;
  if (state.deliveryChainCount >= MaxReentrantDeliveries) {
    delivery.stop();
    delivery.createdStops.forEach((stop) => stop());
    resetDeliveryChain(state);
    ThrowUserInput("Reactive observers exceeded the reentrant delivery limit; break the update cycle.");
  }
  scheduleDeliveryChainReset(state);
}
function disposeEngine(state) {
  if (state.disposed) {
    return;
  }
  state.disposed = true;
  state.cancelDeliveryChainReset?.();
  state.cancelDeliveryChainReset = undefined;
  disposeObservers(state);
  state.pending = [];
}
function disposeObservers(state) {
  state.allStops.forEach((stop) => stop());
  state.allStops.clear();
}
function assertActive(state) {
  if (state.disposed) {
    ThrowShouldNeverHappen("The reactive engine has been disposed.");
  }
}
// ts-api/ts-api-src/ViewComponent.tsx
function createViewComponent(library, path, parameters) {
  return function PublishedView(props) {
    const instance = library.useInstance();
    const view = instance.views[path];
    if (!view) {
      ThrowShouldNeverHappen(`Published Tao view is missing: ${path}.`);
    }
    const values = parameters.map((parameter) => props[parameter]);
    const children = Bridge_react_default.Children.toArray(props.children);
    return ViewRenderExpression(view, ViewRenderArguments(values, children));
  };
}
// 7-runtime/runtime-src/client/Bridge_react-native.ts
import * as ReactNative from "react-native";
var Bridge_react_native_default = ReactNative;

// 7-runtime/runtime-src/client/TaoRuntimeAPI.ts
var Tao = { Text, View: View2, TextInput, Pressable, useWritable, useComputed, useValue };
var TaoRuntimeAPI_default = Tao;
function Text({ style, ...props }) {
  return Bridge_react_default.createElement(Bridge_react_native_default.Text, { ...props, style: [textStyle, style] });
}
function View2(props) {
  return Bridge_react_default.createElement(Bridge_react_native_default.View, props);
}
function TextInput({ style, ...props }) {
  return Bridge_react_default.createElement(Bridge_react_native_default.TextInput, {
    placeholderTextColor: DefaultAppearance.border,
    keyboardAppearance: "dark",
    ...props,
    style: [textStyle, style]
  });
}
function Pressable({ onPress, ...props }) {
  const perform = onPress ? () => batch(onPress) : undefined;
  return Bridge_react_default.createElement(Bridge_react_native_default.Pressable, { ...props, onPress: perform });
}
var textStyle = { color: DefaultAppearance.foreground };

// tao-generated/source/Library.views.tsx
import { jsxDEV } from "react/jsx-dev-runtime";
function useTaoInjectionGreeting$PrivateGreeting_e14d7f2bb079() {
  const count = TaoRuntimeAPI_default.useWritable(() => 0);
  const value = TaoRuntimeAPI_default.useValue(count);
  const caption = TaoRuntimeAPI_default.useComputed(() => "Nested private Tao helper " + count.jsValue(), [count]);
  const label = TaoRuntimeAPI_default.useValue(caption);
  return /* @__PURE__ */ jsxDEV(TaoRuntimeAPI_default.Pressable, {
    onPress: () => count.update(value + 1),
    children: /* @__PURE__ */ jsxDEV(TaoRuntimeAPI_default.Text, {
      children: label
    }, undefined, false, undefined, this)
  }, undefined, false, undefined, this);
}
function TaoView_Greeting$PrivateGreeting_e14d7f2bb079(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionGreeting$PrivateGreeting_e14d7f2bb079());
}
function TaoView_Greeting_e14d7f2bb079(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  const _Imported_Col = ScopeAliases(_Scope, { ["Col"]: "Col" });
  LetDeclaration(_Scope, "PrivateGreeting", ViewDeclaration("PrivateGreeting", [], TaoView_Greeting$PrivateGreeting_e14d7f2bb079, _Scope));
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Col["Col"], ViewRenderArguments([], [
    ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["First"]], [])),
    ViewRenderExpression(_Scope["PrivateGreeting"], ViewRenderArguments([], [])),
    ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["Second"]], []))
  ])));
}
function useTaoInjectionPanel_e14d7f2bb079(Children) {
  return /* @__PURE__ */ jsxDEV(TaoRuntimeAPI_default.View, {
    children: Children
  }, undefined, false, undefined, this);
}
function TaoView_Panel_e14d7f2bb079(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionPanel_e14d7f2bb079(_Render.children));
}
function TaoView_Hidden_e14d7f2bb079(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments(["Unpublished"], [])));
}

// tao-generated/source/Library.ts
function bindAliases(_Scope, _Modules) {
  AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]["Col"]);
  AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]["Text"]);
  AliasBinding(_Scope, "Cards.Caption", () => _Modules["source/cards/Card.ts"]["Caption"]);
  AliasBinding(_Scope, "Cards.Unselected", () => _Modules["source/cards/Other.ts"]["Unselected"]);
  AliasBinding(_Scope, "LanguageFeatures", () => _Modules["source/LanguageFeatures.ts"]["LanguageFeatures"]);
  AliasBinding(_Scope, "ValueSnapshots", () => _Modules["source/ValueSnapshots.ts"]["ValueSnapshots"]);
  AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]["FolderScope"]);
}
function bindDeclarations(_Scope) {
  LetDeclaration(_Scope, "Greeting", ViewDeclaration("Greeting", ["First", "Second"], TaoView_Greeting_e14d7f2bb079, _Scope));
  LetDeclaration(_Scope, "Panel", ViewDeclaration("Panel", [], TaoView_Panel_e14d7f2bb079, _Scope));
  LetDeclaration(_Scope, "Hidden", ViewDeclaration("Hidden", [], TaoView_Hidden_e14d7f2bb079, _Scope));
}

// tao-generated/source/LanguageFeatures.views.tsx
import { jsxDEV as jsxDEV2 } from "react/jsx-dev-runtime";
function useTaoInjectionLanguageFeatures$CapturedCaption_a2b02828914f(Caption) {
  return /* @__PURE__ */ jsxDEV2(TaoRuntimeAPI_default.Text, {
    children: "Aliased capture: " + Caption
  }, undefined, false, undefined, this);
}
function TaoView_LanguageFeatures$CapturedCaption_a2b02828914f(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionLanguageFeatures$CapturedCaption_a2b02828914f(_Scope["Value"]));
}
function TaoView_LanguageFeatures_a2b02828914f(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  const _Imported_FolderScope = ScopeAliases(_Scope, { ["FolderScope"]: "FolderScope" });
  const _Imported_PackageScope = ScopeAliases(_Scope, { ["PackageScope"]: "PackageScope" });
  const _Imported_ProjectScope = ScopeAliases(_Scope, { ["ProjectScope"]: "ProjectScope" });
  const _Imported_Caption = ScopeAliases(_Scope, { ["Caption"]: "Caption" });
  const _Imported_AliasText = ScopeAliases(_Scope, { ["Text"]: "AliasText" });
  const _Imported_Cards$Caption = ScopeAliases(_Scope, { ["Caption"]: "Cards.Caption" });
  const _Imported_Col = ScopeAliases(_Scope, { ["Col"]: "Col" });
  const _Imported_Input = ScopeAliases(_Scope, { ["Input"]: "Input" });
  LetDeclaration(_Scope, "CapturedCaption", ViewDeclaration("CapturedCaption", ["Value"], TaoView_LanguageFeatures$CapturedCaption_a2b02828914f, _Scope));
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Col["Col"], ViewRenderArguments([], [
    ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["FileCaption"]], [])),
    ViewRenderExpression(_Imported_FolderScope["FolderScope"], ViewRenderArguments([], [])),
    ViewRenderExpression(_Imported_PackageScope["PackageScope"], ViewRenderArguments([], [])),
    ViewRenderExpression(_Imported_ProjectScope["ProjectScope"], ViewRenderArguments([], [])),
    ViewRenderExpression(_Imported_Caption["Caption"], ViewRenderArguments(["Wildcard import"], [])),
    ViewRenderExpression(_Imported_AliasText["Text"], ViewRenderArguments(["Tao alias"], [])),
    ViewRenderExpression(_Imported_Cards$Caption["Caption"], ViewRenderArguments(["Namespace member"], [])),
    ViewRenderExpression(_Imported_Col["Col"], ViewRenderArguments([], ViewRenderBlock(_Scope, (_Scope, _Children) => {
      LetDeclaration(_Scope, "FileCaption", "Nested lexical text");
      _Children.push(ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["FileCaption"]], [])));
    }))),
    ViewRenderExpression(_Scope["CapturedCaption"], ViewRenderArguments([_Scope["Name"]], [])),
    ViewRenderExpression(_Scope["ForeignGreeting"], ViewRenderArguments([_Scope["Name"]], [])),
    ViewRenderExpression(_Imported_Input["Input"], ViewRenderArguments(["Library input"], [], "libraryInput")),
    ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["EscapedCaption"]], []))
  ])));
}

// ../Apps/TS Lib App/src/ts/ForeignGreeting.tsx
import React2 from "react";
import { Text as Text2 } from "react-native";
function ForeignGreeting({ Value }) {
  return React2.createElement(Text2, null, "Foreign view: " + Value);
}

// tao-generated/source/LanguageFeatures.ts
function bindAliases2(_Scope, _Modules) {
  AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]["Text"]);
  AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]["Col"]);
  AliasBinding(_Scope, "Row", () => _Modules["tao/ui/Views.ts"]["Row"]);
  AliasBinding(_Scope, "Input", () => _Modules["tao/ui/Views.ts"]["Input"]);
  AliasBinding(_Scope, "AliasText", () => _Modules["tao/ui/Views.ts"]["Text"]);
  AliasBinding(_Scope, "Caption", () => _Modules["source/cards/Card.ts"]["Caption"]);
  AliasBinding(_Scope, "Cards.Caption", () => _Modules["source/cards/Card.ts"]["Caption"]);
  AliasBinding(_Scope, "Cards.Unselected", () => _Modules["source/cards/Other.ts"]["Unselected"]);
  AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]["FolderScope"]);
  AliasBinding(_Scope, "PackageScope", () => _Modules["source/ScopeExamples.ts"]["PackageScope"]);
  AliasBinding(_Scope, "ProjectScope", () => _Modules["source/ScopeExamples.ts"]["ProjectScope"]);
}
function bindDeclarations2(_Scope) {
  LetDeclaration(_Scope, "LanguageFeatures", ViewDeclaration("LanguageFeatures", ["Name"], TaoView_LanguageFeatures_a2b02828914f, _Scope));
  LetDeclaration(_Scope, "ForeignGreeting", ForeignView("ForeignGreeting", ["Value"], ForeignGreeting, _Scope));
}
function initializeFileCaption(_Scope) {
  LetDeclaration(_Scope, "FileCaption", "File-scoped text");
}
function initializeEscapedCaption(_Scope) {
  LetDeclaration(_Scope, "EscapedCaption", 'Escaped "text", backslash \\ and Unicode ☺');
}

// tao-generated/source/ScopeExamples.views.tsx
function TaoView_FolderScope_2b7780826b86(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments(["Folder-scoped view"], [])));
}
function TaoView_PackageScope_2b7780826b86(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments(["Package-scoped view"], [])));
}
function TaoView_ProjectScope_2b7780826b86(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments(["Project-scoped view"], [])));
}

// tao-generated/source/ScopeExamples.ts
function bindAliases3(_Scope, _Modules) {
  AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]["Text"]);
}
function bindDeclarations3(_Scope) {
  LetDeclaration(_Scope, "FolderScope", ViewDeclaration("FolderScope", [], TaoView_FolderScope_2b7780826b86, _Scope));
  LetDeclaration(_Scope, "PackageScope", ViewDeclaration("PackageScope", [], TaoView_PackageScope_2b7780826b86, _Scope));
  LetDeclaration(_Scope, "ProjectScope", ViewDeclaration("ProjectScope", [], TaoView_ProjectScope_2b7780826b86, _Scope));
}

// tao-generated/source/ValueSnapshots.views.tsx
import { jsxDEV as jsxDEV3 } from "react/jsx-dev-runtime";
function useTaoInjectionValueSnapshots_d91ca1acb358() {
  const mode = TaoRuntimeAPI_default.useWritable(() => "initial");
  const value = TaoRuntimeAPI_default.useComputed(() => {
    const currentMode = mode.jsValue();
    const reordered = currentMode === "reordered" || currentMode === "extra-duplicate";
    const labels = reordered ? ["B", "A", "A"] : ["A", "A", "B"];
    if (currentMode === "extra-duplicate") {
      labels.push("A");
    }
    return { rows: labels.map((label) => ({ label })) };
  }, [mode]);
  const comparison = TaoRuntimeAPI_default.useWritable(() => "");
  const snapshot = TaoRuntimeAPI_default.useValue(value);
  const result = TaoRuntimeAPI_default.useValue(comparison);
  return /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.View, {
    children: [
      /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Text, {
        children: snapshot.rows.map((row) => row.label).join(", ")
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Pressable, {
        testID: "recompute-equal",
        onPress: () => {
          const previous = value.jsValue();
          mode.update("equal");
          comparison.update(value.jsValue() === previous ? "Reused snapshot" : "Replaced snapshot");
        },
        children: /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Text, {
          children: "Recompute equal rows"
        }, undefined, false, undefined, this)
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Text, {
        children: result
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Pressable, {
        testID: "reorder-rows",
        onPress: () => mode.update("reordered"),
        children: /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Text, {
          children: "Reorder rows"
        }, undefined, false, undefined, this)
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Pressable, {
        testID: "add-duplicate-row",
        onPress: () => mode.update("extra-duplicate"),
        children: /* @__PURE__ */ jsxDEV3(TaoRuntimeAPI_default.Text, {
          children: "Add another matching row"
        }, undefined, false, undefined, this)
      }, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
}
function TaoView_ValueSnapshots_d91ca1acb358(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionValueSnapshots_d91ca1acb358());
}

// tao-generated/source/ValueSnapshots.ts
function bindAliases4(_Scope, _Modules) {
  AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]["FolderScope"]);
}
function bindDeclarations4(_Scope) {
  LetDeclaration(_Scope, "ValueSnapshots", ViewDeclaration("ValueSnapshots", [], TaoView_ValueSnapshots_d91ca1acb358, _Scope));
}

// tao-generated/tao/ui/Views.views.tsx
import { jsxDEV as jsxDEV4 } from "react/jsx-dev-runtime";
function useTaoInjectionText_9bf877ca8681(Value) {
  return /* @__PURE__ */ jsxDEV4(TaoRuntimeAPI_default.Text, {
    children: Value
  }, undefined, false, undefined, this);
}
function TaoView_Text_9bf877ca8681(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionText_9bf877ca8681(_Scope["Value"]));
}
function useTaoInjectionCol_9bf877ca8681(Children) {
  return /* @__PURE__ */ jsxDEV4(TaoRuntimeAPI_default.View, {
    style: { flexDirection: "column" },
    children: Children
  }, undefined, false, undefined, this);
}
function TaoView_Col_9bf877ca8681(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionCol_9bf877ca8681(_Render.children));
}
function useTaoInjectionRow_9bf877ca8681(Children) {
  return /* @__PURE__ */ jsxDEV4(TaoRuntimeAPI_default.View, {
    style: { flexDirection: "row" },
    children: Children
  }, undefined, false, undefined, this);
}
function TaoView_Row_9bf877ca8681(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionRow_9bf877ca8681(_Render.children));
}
function useTaoInjectionInput_9bf877ca8681(Value) {
  return /* @__PURE__ */ jsxDEV4(TaoRuntimeAPI_default.TextInput, {
    defaultValue: Value
  }, undefined, false, undefined, this);
}
function TaoView_Input_9bf877ca8681(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  return finishViewRender(_Render, useTaoInjectionInput_9bf877ca8681(_Scope["Value"]));
}

// tao-generated/tao/ui/Views.ts
function bindAliases5(_Scope, _Modules) {}
function bindDeclarations5(_Scope) {
  LetDeclaration(_Scope, "Text", ViewDeclaration("Text", ["Value"], TaoView_Text_9bf877ca8681, _Scope));
  LetDeclaration(_Scope, "Col", ViewDeclaration("Col", [], TaoView_Col_9bf877ca8681, _Scope));
  LetDeclaration(_Scope, "Row", ViewDeclaration("Row", [], TaoView_Row_9bf877ca8681, _Scope));
  LetDeclaration(_Scope, "Input", ViewDeclaration("Input", ["Value"], TaoView_Input_9bf877ca8681, _Scope));
}

// tao-generated/source/cards/Card.views.tsx
function TaoView_Caption_e8e5822cf03d(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments([_Scope["Value"]], [])));
}

// tao-generated/source/cards/Card.ts
function bindAliases6(_Scope, _Modules) {
  AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]["Text"]);
}
function bindDeclarations6(_Scope) {
  LetDeclaration(_Scope, "Caption", ViewDeclaration("Caption", ["Value"], TaoView_Caption_e8e5822cf03d, _Scope));
}

// tao-generated/source/cards/Other.views.tsx
function TaoView_Unselected_a6f315dbebd4(_Props) {
  const _Render = beginViewRender(_Props);
  const _Scope = _Render.scope;
  const _Imported_Text = ScopeAliases(_Scope, { ["Text"]: "Text" });
  return finishViewRender(_Render, ViewRenderExpression(_Imported_Text["Text"], ViewRenderArguments(["Unselected public view"], [])));
}

// tao-generated/source/cards/Other.ts
function bindAliases7(_Scope, _Modules) {
  AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]["Text"]);
}
function bindDeclarations7(_Scope) {
  LetDeclaration(_Scope, "Unselected", ViewDeclaration("Unselected", [], TaoView_Unselected_a6f315dbebd4, _Scope));
}

// tao-generated/source/cards/Publication.ts
function bindAliases8(_Scope, _Modules) {}
function bindDeclarations8(_Scope) {}

// tao-generated/Library.ts
var library = createLibrary(() => {
  const _scope0 = Scope();
  const _scope1 = Scope();
  const _scope2 = Scope();
  const _scope3 = Scope();
  const _scope4 = Scope();
  const _scope5 = Scope();
  const _scope6 = Scope();
  const _scope7 = Scope();
  const _Modules = {
    "source/Library.ts": _scope0,
    "source/LanguageFeatures.ts": _scope1,
    "source/ScopeExamples.ts": _scope2,
    "source/ValueSnapshots.ts": _scope3,
    "tao/ui/Views.ts": _scope4,
    "source/cards/Card.ts": _scope5,
    "source/cards/Other.ts": _scope6,
    "source/cards/Publication.ts": _scope7
  };
  bindAliases(_scope0, _Modules);
  bindAliases2(_scope1, _Modules);
  bindAliases3(_scope2, _Modules);
  bindAliases4(_scope3, _Modules);
  bindAliases5(_scope4, _Modules);
  bindAliases6(_scope5, _Modules);
  bindAliases7(_scope6, _Modules);
  bindAliases8(_scope7, _Modules);
  bindDeclarations(_scope0);
  bindDeclarations2(_scope1);
  bindDeclarations3(_scope2);
  bindDeclarations4(_scope3);
  bindDeclarations5(_scope4);
  bindDeclarations6(_scope5);
  bindDeclarations7(_scope6);
  bindDeclarations8(_scope7);
  initializeFileCaption(_scope1);
  initializeEscapedCaption(_scope1);
  return { Greeting: _scope0["Greeting"], Panel: _scope0["Panel"], LanguageFeatures: _scope1["LanguageFeatures"], ValueSnapshots: _scope3["ValueSnapshots"], "Cards/Caption": _scope5["Caption"] };
});
var Published0 = createViewComponent(library, "Greeting", ["First", "Second"]);
var Published1 = createViewComponent(library, "Panel", []);
var Published2 = createViewComponent(library, "LanguageFeatures", ["Name"]);
var Published3 = createViewComponent(library, "ValueSnapshots", []);
var Published4 = createViewComponent(library, "Cards/Caption", ["Value"]);
var Library_default = library;
export {
  Published0,
  Published1,
  Published2,
  Published3,
  Published4,
  Library_default as default
};
