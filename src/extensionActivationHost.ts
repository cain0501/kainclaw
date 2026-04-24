type DisposableLike = {
  dispose: () => unknown;
};

type SidebarProviderLike = {
  focus: () => Promise<void>;
  clearChat: () => void;
  showSettingsPanel: () => void;
  dispose: () => Promise<void> | void;
};

export function registerChatSidebarExtension(options: {
  viewType: string;
  provider: SidebarProviderLike;
  registerWebviewViewProvider: (
    viewType: string,
    provider: unknown,
  ) => DisposableLike;
  registerCommand: (
    commandId: string,
    callback: () => unknown,
  ) => DisposableLike;
}): DisposableLike[] {
  return [
    options.registerWebviewViewProvider(options.viewType, options.provider),
    options.registerCommand("terminalAiAssistant.focus", async () => {
      await options.provider.focus();
    }),
    options.registerCommand("terminalAiAssistant.clearChat", () => {
      options.provider.clearChat();
    }),
    options.registerCommand("terminalAiAssistant.openSettings", () => {
      options.provider.showSettingsPanel();
    }),
    {
      dispose: () => {
        void options.provider.dispose();
      },
    },
  ];
}
