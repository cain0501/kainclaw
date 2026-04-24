import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import { AutoMemoryExtractor } from "./autoMemory/extractor";
import type { PlanModeState } from "./planMode/planMode";
import type { ChatMessage } from "./storage/sessionRepository";
import { distillUserProfile } from "./userModel/profileDistiller";
import type { ProfileStore } from "./userModel/profileStore";

type AutoMemoryRuntime = Pick<
  AutoMemoryExtractor,
  "markConversationBaseline" | "resetConversation" | "queueExtraction"
>;

export type AutoMemoryHostBindings = {
  markCurrentConversationBaseline: (count: number) => void;
  resetConversation: (conversationKey: string) => void;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
};

export function buildAutoMemoryHistory(
  sessionMessages: ChatMessage[],
): Array<{ role: ChatMessage["role"]; content: string }> {
  return sessionMessages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

export function createAutoMemoryHostBindings(options: {
  getConversationKey: () => string;
  getPlanModeState: () => Pick<PlanModeState, "active">;
  getSessionMessages: () => ChatMessage[];
  createProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
  }) => IProviderAdapter;
  autoMemory?: AutoMemoryRuntime;
  profileStore?: ProfileStore;
}): AutoMemoryHostBindings {
  const autoMemory = options.autoMemory ?? new AutoMemoryExtractor();

  return {
    markCurrentConversationBaseline: count => {
      autoMemory.markConversationBaseline(options.getConversationKey(), count);
    },
    resetConversation: conversationKey => {
      autoMemory.resetConversation(conversationKey);
    },
    queueAutoMemoryExtraction: ({
      workspaceRoot,
      config,
      envMap,
    }) => {
      if (options.getPlanModeState().active) {
        return;
      }

      autoMemory.queueExtraction({
        conversationKey: options.getConversationKey(),
        workspaceRoot,
        history: buildAutoMemoryHistory(options.getSessionMessages()),
        createProvider: systemPrompt =>
          options.createProviderAdapter({
            config,
            workspaceRoot,
            systemPrompt,
            envMap,
          }),
      });

      if (options.profileStore) {
        const history = buildAutoMemoryHistory(options.getSessionMessages());
        const provider = options.createProviderAdapter({
          config,
          workspaceRoot,
          systemPrompt: "",
          envMap,
        });
        void distillUserProfile(history, options.profileStore, provider);
      }
    },
  };
}
