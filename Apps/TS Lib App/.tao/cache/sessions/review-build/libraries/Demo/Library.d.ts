import type * as React from 'react';
declare const instanceOwner: unique symbol;
export type Instance = {
  readonly [instanceOwner]: true;
  readonly disposed: boolean;
  dispose(): void;
};
declare const library: {
  instantiate(): Instance;
  Provider: React.ComponentType<{ instance: Instance; children?: React.ReactNode }>;
};
export default library;