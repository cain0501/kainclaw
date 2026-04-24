import { createAutoCompactConversationRunner } from "./compactHost";
import {
  createPromptCallbackBindings,
  type PromptEntryCallbackBindings,
  type PromptFlowCallbackBindings,
} from "./promptCallbackHost";
import {
  createPromptSharedBindings,
} from "./promptBindingsHost";
import type { PromptRuntimeLike } from "./promptExecutionHost";
import {
  createPromptFlowBindingsFromShared,
} from "./promptFlowHost";
import type { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import {
  createPromptHostBindings,
  type PromptHostBindings,
} from "./promptHost";
import {
  createPromptEntryBindingsFromShared,
} from "./promptEntryHost";
import { createPromptTurnSwarmFactory } from "./promptSwarmHost";
import { createWorkspaceSystemPromptBuilder } from "./promptSetupHost";

type PromptSharedOptions = Parameters<typeof createPromptSharedBindings>[0];
type PromptCallbackOptions = Parameters<typeof createPromptCallbackBindings>[0];

type PromptEntryFromSharedOptions<TRuntime extends PromptRuntimeLike> =
  Parameters<typeof createPromptEntryBindingsFromShared<TRuntime>>[0];

type PromptFlowFromSharedOptions<TRuntime extends PromptRuntimeLike> =
  Parameters<
    typeof createPromptFlowBindingsFromShared<SwarmCoordinator, TRuntime>
  >[0];

export type PromptEntryAssemblyOptions<TRuntime extends PromptRuntimeLike> = Omit<
  PromptEntryFromSharedOptions<TRuntime>,
  "sharedBindings" | keyof PromptEntryCallbackBindings
>;

export type PromptFlowAssemblyOptions<
  TRuntime extends PromptRuntimeLike,
> = Omit<
  PromptFlowFromSharedOptions<TRuntime>,
  | "sharedBindings"
  | keyof PromptFlowCallbackBindings
  | "maybeAutoCompactConversation"
  | "createSwarm"
  | "buildWorkspaceSystemPrompt"
> & {
  autoCompact: Omit<
    Parameters<typeof createAutoCompactConversationRunner>[0],
    | "getConversationHistory"
    | "getTranscriptPath"
    | "createProviderAdapter"
    | "addPhaseActivity"
    | "finishPhaseActivity"
  >;
  swarmFactory: Omit<
    Parameters<typeof createPromptTurnSwarmFactory>[0],
    "buildProviderAdapter"
  >;
  systemPrompt: Parameters<typeof createWorkspaceSystemPromptBuilder>[0];
};

export type PromptHostAssemblyOptions<TRuntime extends PromptRuntimeLike> = {
  shared: PromptSharedOptions;
  callbacks: PromptCallbackOptions;
  entry: PromptEntryAssemblyOptions<TRuntime>;
  flow: PromptFlowAssemblyOptions<TRuntime>;
};

export function assemblePromptHostBindings<
  TRuntime extends PromptRuntimeLike,
>(options: PromptHostAssemblyOptions<TRuntime>): PromptHostBindings<
  SwarmCoordinator,
  TRuntime
> {
  const sharedBindings = createPromptSharedBindings(options.shared);
  const callbackBindings = createPromptCallbackBindings(options.callbacks);
  const { autoCompact, swarmFactory, systemPrompt, ...flowBindings } =
    options.flow;

  return createPromptHostBindings<SwarmCoordinator, TRuntime>({
    sharedBindings,
    entry: {
      ...options.entry,
      ...callbackBindings.entry,
    },
    flow: {
      ...flowBindings,
      maybeAutoCompactConversation: createAutoCompactConversationRunner({
        ...autoCompact,
        getConversationHistory: sharedBindings.getConversationHistory,
        getTranscriptPath: sharedBindings.getTranscriptPath,
        createProviderAdapter: ({
          config,
          workspaceRoot,
          systemPrompt,
          envMap,
        }) =>
          sharedBindings.createProviderAdapter({
            config,
            workspaceRoot,
            systemPrompt,
            envMap,
          }),
        addPhaseActivity: sharedBindings.addPhaseActivity,
        finishPhaseActivity: sharedBindings.finishPhaseActivity,
      }),
      createSwarm: createPromptTurnSwarmFactory({
        ...swarmFactory,
        buildProviderAdapter: sharedBindings.createProviderAdapter,
      }),
      buildWorkspaceSystemPrompt: createWorkspaceSystemPromptBuilder(
        systemPrompt,
      ),
      ...callbackBindings.flow,
    },
  });
}
