import {
  handleChatWebviewMessage,
  type WebviewAttachment,
} from "./chatCommandHost";
import { handleSessionWebviewMessage } from "./sessionCommandHost";
import { handleSettingsWebviewMessage } from "./settingsCommandHost";

export type SidebarWebviewMessage = {
  type?: unknown;
  prompt?: unknown;
  action?: unknown;
  attachments?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  providerMeta?: unknown;
  meta?: unknown;
  id?: unknown;
  enabled?: unknown;
  key?: unknown;
  title?: unknown;
};

type SidebarWebviewPort = {
  options: {
    enableScripts?: boolean;
    localResourceRoots?: readonly unknown[];
  };
  html: string;
  onDidReceiveMessage: (
    listener: (message: SidebarWebviewMessage) => Promise<void>,
  ) => unknown;
};

export type SidebarWebviewViewLike = {
  webview: SidebarWebviewPort;
};

export function configureSidebarWebviewView(options: {
  webviewView: SidebarWebviewViewLike;
  html: string;
  localResourceRoots: readonly unknown[];
  handleMessage: (message: SidebarWebviewMessage) => Promise<void>;
}): void {
  options.webviewView.webview.options = {
    enableScripts: true,
    localResourceRoots: options.localResourceRoots,
  };
  options.webviewView.webview.html = options.html;
  options.webviewView.webview.onDidReceiveMessage(message =>
    options.handleMessage(message),
  );
}

export async function routeSidebarWebviewMessage(options: {
  message: SidebarWebviewMessage;
  session: {
    isMultiSessionEnabled: () => boolean;
    postLicenseRequired: (feature: "multiSession") => void;
    setSessionsPanelOpen: (open: boolean) => void;
    loadSessions: () => Promise<void>;
    switchSession: (id: string) => Promise<void>;
    renameSession: (id: string, title: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    exportSession: (id: string) => Promise<void>;
    createNewSession: () => Promise<void>;
  };
  settings: {
    validateOnboardingKey: (
      providerType: string,
      apiKey: string,
      baseUrl?: string,
      model?: string,
    ) => Promise<void>;
    completeOnboarding: (meta: unknown, apiKey: string) => Promise<void>;
    loadSettings: () => Promise<void>;
    saveSettingsProvider: (meta: unknown, apiKey?: string) => Promise<void>;
    deleteSettingsProvider: (id: string) => Promise<void>;
    setShowThinkingSummaries: (enabled: unknown) => Promise<void>;
    setActiveProvider: (id: string) => Promise<void>;
    closeSettings: () => void;
    activateLicense: (rawKey: string) => Promise<void>;
  };
  chat: {
    ensureReadySequence: () => Promise<void>;
    clearChat: () => void;
    sendPrompt: (
      prompt: string,
      attachments?: WebviewAttachment[],
    ) => Promise<void>;
    runQuickAction: (action: string) => Promise<void>;
    resolvePendingApproval: (approved: boolean) => void;
    requestEditorSelection: () => void;
  };
}): Promise<void> {
  const handledSessionMessage = await handleSessionWebviewMessage({
    message: options.message,
    ...options.session,
  });
  if (handledSessionMessage) {
    return;
  }

  const handledSettingsMessage = await handleSettingsWebviewMessage({
    message: options.message,
    ...options.settings,
  });
  if (handledSettingsMessage) {
    return;
  }

  await handleChatWebviewMessage({
    message: options.message,
    ...options.chat,
  });
}
