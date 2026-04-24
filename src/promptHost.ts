import type { PromptSharedBindings } from "./promptBindingsHost";
import {
  createPromptEntryBindingsFromShared,
  type PromptEntryHostBindings,
} from "./promptEntryHost";
import type { PromptRuntimeLike } from "./promptExecutionHost";
import {
  createPromptFlowBindingsFromShared,
} from "./promptFlowHost";

type PromptEntryFromSharedOptions<TRuntime extends PromptRuntimeLike> =
  Parameters<typeof createPromptEntryBindingsFromShared<TRuntime>>[0];

type PromptFlowFromSharedOptions<TSwarm, TRuntime extends PromptRuntimeLike> =
  Parameters<typeof createPromptFlowBindingsFromShared<TSwarm, TRuntime>>[0];

export type PromptHostBindings<TSwarm, TRuntime extends PromptRuntimeLike> = {
  entryBindings: PromptEntryHostBindings<TRuntime>;
  flowBindings: ReturnType<
    typeof createPromptFlowBindingsFromShared<TSwarm, TRuntime>
  >;
};

export function createPromptHostBindings<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  sharedBindings: PromptSharedBindings;
  entry: Omit<PromptEntryFromSharedOptions<TRuntime>, "sharedBindings">;
  flow: Omit<PromptFlowFromSharedOptions<TSwarm, TRuntime>, "sharedBindings">;
}): PromptHostBindings<TSwarm, TRuntime> {
  return {
    entryBindings: createPromptEntryBindingsFromShared<TRuntime>({
      sharedBindings: options.sharedBindings,
      ...options.entry,
    }),
    flowBindings: createPromptFlowBindingsFromShared<TSwarm, TRuntime>({
      sharedBindings: options.sharedBindings,
      ...options.flow,
    }),
  };
}
