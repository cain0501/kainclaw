import { buildProviderAdapter } from "../providerHost";
import type {
  LocalBridgeProxyHandler,
  LocalBridgeProxyRuntimeContext,
} from "../platform/localBridgeRuntime";

export function createLocalBridgeProxyHandler(options: {
  resolveRuntimeContext: () => Promise<LocalBridgeProxyRuntimeContext>;
}): LocalBridgeProxyHandler {
  return async (request, runtimeOptions) => {
    const runtimeContext = await options.resolveRuntimeContext();
    const adapter = buildProviderAdapter(
      runtimeContext.config,
      runtimeContext.workspaceRoot,
      runtimeContext.systemPrompt,
      runtimeContext.envMap ?? {},
    );

    return await adapter.runStep(
      request.messages,
      request.tools ?? [],
      runtimeOptions.onToken,
      runtimeOptions.abortSignal,
    );
  };
}
