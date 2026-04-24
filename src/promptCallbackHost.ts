import type { PromptEntryCommandBindings } from "./promptEntryHost";
import type { PromptRuntimeLike } from "./promptExecutionHost";

type ToolExecutionStatus = "done" | "error";
type PromptCompanionState = "thinking" | "working" | "done" | "idle";
type FlowCompanionState = Exclude<PromptCompanionState, "idle">;

export type PromptEntryCallbackBindings = Pick<
  PromptEntryCommandBindings<PromptRuntimeLike>,
  | "onStreamingToken"
  | "startToolExecution"
  | "finishToolExecution"
  | "recordAssistantReply"
  | "setCompanionState"
  | "clearStreamingText"
  | "updateMood"
>;

export type PromptFlowCallbackBindings = {
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: ToolExecutionStatus,
    summary?: string,
  ) => void;
  onToolError: () => void;
  setCompanionState: (state: FlowCompanionState) => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
};

export function createPromptCallbackBindings(options: {
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: ToolExecutionStatus,
    summary?: string,
  ) => void;
  onToolError: () => void;
  setCompanionState: (state: PromptCompanionState) => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
}): {
  entry: PromptEntryCallbackBindings;
  flow: PromptFlowCallbackBindings;
} {
  return {
    entry: {
      onStreamingToken: token => {
        options.appendStreamingText(token);
        options.scheduleStreamingStateUpdate();
        options.postChatToken(token);
      },
      startToolExecution: options.startToolExecution,
      finishToolExecution: options.finishToolExecution,
      recordAssistantReply: (reply, includeInConversation) =>
        options.recordAssistantReply(reply, includeInConversation),
      setCompanionState: options.setCompanionState,
      clearStreamingText: options.clearStreamingText,
      updateMood: options.updateMood,
    },
    flow: {
      appendStreamingText: options.appendStreamingText,
      scheduleStreamingStateUpdate: options.scheduleStreamingStateUpdate,
      postChatToken: options.postChatToken,
      startToolExecution: options.startToolExecution,
      finishToolExecution: options.finishToolExecution,
      onToolError: options.onToolError,
      setCompanionState: state => options.setCompanionState(state),
      updateMood: options.updateMood,
      recordAssistantReply: options.recordAssistantReply,
      clearStreamingText: options.clearStreamingText,
    },
  };
}
