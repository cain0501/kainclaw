import type { SessionIndex } from "./storage/sessionRepository";
import {
  tryRestoreSavedSessionWithHost,
  type SavedSessionActivationBindings,
} from "./savedSessionHost";

export type ReadySequenceAction =
  | { kind: "show_onboarding" }
  | { kind: "license_required" }
  | {
      kind: "continue";
      restored: boolean;
      restoredSessionId?: string;
      restoredSource?: "active" | "workspace-fallback";
    };

export type ReadySequenceRunnerBindings = {
  restoreLicenseFlags: () => Promise<void>;
  initializeCompanion: () => Promise<void>;
  getOnboardingDone: () => boolean;
  getSessionPersistenceEnabled: () => boolean;
  getWorkspaceRoot: () => string | undefined;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  getLastSessionId: () => string | undefined;
  readIndex: () => Promise<SessionIndex>;
  tryRestoreSavedSession: (
    sessionId: string,
    source: "active" | "workspace-fallback",
  ) => Promise<boolean>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  showOnboarding: () => void;
  logReady: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => void;
  postLicenseRequired: (feature: "sessionPersistence") => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  logRestoreMissed: (details: { workspaceHash: string }) => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
  onSessionStart?: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => Promise<void> | void;
};

export type ReadySequenceController = {
  ensureReadySequence: () => Promise<void>;
  reset: () => void;
  isReady: () => boolean;
};

export type ReadySequenceRunnerFactory = () => Promise<ReadySequenceAction>;

export function createReadySequenceController(options: {
  runReadySequence: () => Promise<unknown>;
}): ReadySequenceController {
  let ready = false;
  let operation: Promise<void> | undefined;

  return {
    ensureReadySequence: async () => {
      if (ready) {
        return;
      }

      if (operation) {
        await operation;
        return;
      }

      const nextOperation = Promise.resolve(options.runReadySequence()).then(() => undefined);
      operation = nextOperation;
      try {
        await nextOperation;
        ready = true;
      } finally {
        if (operation === nextOperation) {
          operation = undefined;
        }
      }
    },
    reset: () => {
      ready = false;
    },
    isReady: () => ready,
  };
}

export function createReadySequenceRunner(
  options: ReadySequenceRunnerBindings,
): () => Promise<ReadySequenceAction> {
  return async () => {
    await options.restoreLicenseFlags();
    await options.initializeCompanion();

    const workspaceRoot = options.getWorkspaceRoot();
    const workspaceHash = options.getWorkspaceHash(workspaceRoot);
    const lastSessionId = options.getLastSessionId();

    return runReadySequenceWithHost({
      onboardingDone: options.getOnboardingDone(),
      sessionPersistenceEnabled: options.getSessionPersistenceEnabled(),
      workspaceRoot,
      workspaceHash,
      lastSessionId,
      readIndex: options.readIndex,
      tryRestoreSavedSession: options.tryRestoreSavedSession,
      setActiveSessionId: options.setActiveSessionId,
      showOnboarding: options.showOnboarding,
      logReady: options.logReady,
      postLicenseRequired: options.postLicenseRequired,
      postState: options.postState,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      logRestoreMissed: options.logRestoreMissed,
      ensureConversationWorktreeHydrated:
        options.ensureConversationWorktreeHydrated,
      shouldRefreshSessionsList: options.shouldRefreshSessionsList,
      handleSessionsLoad: options.handleSessionsLoad,
    });
  };
}

export function createReadySequenceRunnerFactory(options: {
  restoreLicenseFlags: () => Promise<void>;
  initializeCompanion: () => Promise<void>;
  getOnboardingDone: () => boolean;
  getSessionPersistenceEnabled: () => boolean;
  getWorkspaceRoot: () => string | undefined;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  getLastSessionId: () => string | undefined;
  readIndex: () => Promise<SessionIndex>;
  loadMessages: (sessionId: string) => Promise<any[]>;
  loadRuntimeState: (sessionId: string) => Promise<any>;
  savedSessionActivationBindings: SavedSessionActivationBindings;
  setActiveSessionId: (id: string) => Promise<unknown>;
  showOnboarding: () => void;
  logReady: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => void;
  postLicenseRequired: (feature: "sessionPersistence") => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  logRestoreMissed: (details: { workspaceHash: string }) => void;
  logRestoreSkippedEmpty: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
  }) => void;
  logRestoreSuccess: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
    messageCount: number;
    hasPendingPlanVerification: boolean;
  }) => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
  onSessionStart?: ReadySequenceRunnerBindings["onSessionStart"];
}): ReadySequenceRunnerFactory {
  return createReadySequenceRunner({
    restoreLicenseFlags: options.restoreLicenseFlags,
    initializeCompanion: options.initializeCompanion,
    getOnboardingDone: options.getOnboardingDone,
    getSessionPersistenceEnabled: options.getSessionPersistenceEnabled,
    getWorkspaceRoot: options.getWorkspaceRoot,
    getWorkspaceHash: options.getWorkspaceHash,
    getLastSessionId: options.getLastSessionId,
    readIndex: options.readIndex,
    tryRestoreSavedSession: (sessionId, source) =>
      tryRestoreSavedSessionWithHost({
        sessionId,
        source,
        loadMessages: id => options.loadMessages(id),
        loadRuntimeState: id => options.loadRuntimeState(id),
        ...options.savedSessionActivationBindings,
        logRestoreSkippedEmpty: options.logRestoreSkippedEmpty,
        logRestoreSuccess: options.logRestoreSuccess,
      }),
    setActiveSessionId: options.setActiveSessionId,
    showOnboarding: options.showOnboarding,
    logReady: options.logReady,
    postLicenseRequired: options.postLicenseRequired,
    postState: options.postState,
    refreshWorkspaceStatus: options.refreshWorkspaceStatus,
    logRestoreMissed: options.logRestoreMissed,
    ensureConversationWorktreeHydrated:
      options.ensureConversationWorktreeHydrated,
    shouldRefreshSessionsList: options.shouldRefreshSessionsList,
    handleSessionsLoad: options.handleSessionsLoad,
  });
}

export type ReadySequenceControllerFactoryOptions = {
  restoreLicenseFlags: () => Promise<void>;
  initializeCompanion: () => Promise<void>;
  getOnboardingDone: () => boolean;
  getSessionPersistenceEnabled: () => boolean;
  getWorkspaceRoot: () => string | undefined;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  getLastSessionId: () => string | undefined;
  readIndex: () => Promise<SessionIndex>;
  loadMessages: (sessionId: string) => Promise<any[]>;
  loadRuntimeState: (sessionId: string) => Promise<any>;
  savedSessionActivationBindings: SavedSessionActivationBindings;
  setActiveSessionId: (id: string) => Promise<unknown>;
  postLicenseRequired: (feature: "sessionPersistence") => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  onSessionStart?: ReadySequenceRunnerBindings["onSessionStart"];
};

export type ReadySequenceControllerFactoryState = {
  showOnboarding: () => void;
  logReady: ReadySequenceRunnerBindings["logReady"];
  logRestoreMissed: (details: { workspaceHash: string }) => void;
  logRestoreSkippedEmpty: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
  }) => void;
  logRestoreSuccess: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
    messageCount: number;
    hasPendingPlanVerification: boolean;
  }) => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
};

export type ReadySequenceControllerFactory = (
  state: ReadySequenceControllerFactoryState,
) => ReadySequenceController;

export function createReadySequenceControllerFactory(
  options: ReadySequenceControllerFactoryOptions,
): ReadySequenceControllerFactory {
  return state => {
    const runReadySequence = createReadySequenceRunnerFactory({
      restoreLicenseFlags: options.restoreLicenseFlags,
      initializeCompanion: options.initializeCompanion,
      getOnboardingDone: options.getOnboardingDone,
      getSessionPersistenceEnabled: options.getSessionPersistenceEnabled,
      getWorkspaceRoot: options.getWorkspaceRoot,
      getWorkspaceHash: options.getWorkspaceHash,
      getLastSessionId: options.getLastSessionId,
      readIndex: options.readIndex,
      loadMessages: options.loadMessages,
      loadRuntimeState: options.loadRuntimeState,
      savedSessionActivationBindings: options.savedSessionActivationBindings,
      setActiveSessionId: options.setActiveSessionId,
      showOnboarding: state.showOnboarding,
      logReady: state.logReady,
      postLicenseRequired: options.postLicenseRequired,
      postState: options.postState,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      logRestoreMissed: state.logRestoreMissed,
      logRestoreSkippedEmpty: state.logRestoreSkippedEmpty,
      logRestoreSuccess: state.logRestoreSuccess,
      ensureConversationWorktreeHydrated:
        options.ensureConversationWorktreeHydrated,
      shouldRefreshSessionsList: state.shouldRefreshSessionsList,
      handleSessionsLoad: state.handleSessionsLoad,
      onSessionStart: options.onSessionStart,
    });

    return createReadySequenceController({
      runReadySequence,
    });
  };
}

export async function resolveReadySequenceAction(options: {
  onboardingDone: boolean;
  sessionPersistenceEnabled: boolean;
  lastSessionId?: string;
  workspaceHash: string;
  readIndex: () => Promise<SessionIndex>;
  tryRestoreSavedSession: (
    sessionId: string,
    source: "active" | "workspace-fallback",
  ) => Promise<boolean>;
  setActiveSessionId: (id: string) => Promise<unknown>;
}): Promise<ReadySequenceAction> {
  if (!options.onboardingDone) {
    return { kind: "show_onboarding" };
  }

  if (options.lastSessionId && !options.sessionPersistenceEnabled) {
    return { kind: "license_required" };
  }

  if (!options.sessionPersistenceEnabled) {
    return { kind: "continue", restored: false };
  }

  if (options.lastSessionId) {
    const restoredActive = await options.tryRestoreSavedSession(
      options.lastSessionId,
      "active",
    );
    if (restoredActive) {
      return {
        kind: "continue",
        restored: true,
        restoredSessionId: options.lastSessionId,
        restoredSource: "active",
      };
    }
  }

  const index = await options.readIndex();
  const fallback = index.sessions.find(
    session => session.workspaceHash === options.workspaceHash,
  );
  if (!fallback) {
    return { kind: "continue", restored: false };
  }

  const restoredFallback = await options.tryRestoreSavedSession(
    fallback.id,
    "workspace-fallback",
  );
  if (!restoredFallback) {
    return { kind: "continue", restored: false };
  }

  if (fallback.id !== options.lastSessionId) {
    await options.setActiveSessionId(fallback.id);
  }

  return {
    kind: "continue",
    restored: true,
    restoredSessionId: fallback.id,
    restoredSource: "workspace-fallback",
  };
}

export async function applyReadySequenceAction(options: {
  readyAction: ReadySequenceAction;
  workspaceRoot?: string;
  workspaceHash: string;
  lastSessionId?: string;
  postOnboarding: () => void;
  logReady: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => void;
  postLicenseRequired: (feature: "sessionPersistence") => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  logRestoreMissed: (details: { workspaceHash: string }) => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
  onSessionStart?: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => Promise<void> | void;
}): Promise<void> {
  if (options.readyAction.kind === "show_onboarding") {
    options.postOnboarding();
    return;
  }

  options.logReady({
    workspaceRoot: options.workspaceRoot ?? null,
    workspaceHash: options.workspaceHash,
    lastSessionId: options.lastSessionId ?? null,
  });

  if (options.readyAction.kind === "license_required") {
    options.postLicenseRequired("sessionPersistence");
    options.postState();
    options.refreshWorkspaceStatus();
    return;
  }

  if (!options.readyAction.restored) {
    options.logRestoreMissed({
      workspaceHash: options.workspaceHash,
    });
  }

  if (options.workspaceRoot) {
    await options.ensureConversationWorktreeHydrated(options.workspaceRoot);
  }

  options.postState();
  if (options.shouldRefreshSessionsList()) {
    await options.handleSessionsLoad();
  }
  options.refreshWorkspaceStatus();
  await options.onSessionStart?.({
    workspaceRoot: options.workspaceRoot ?? null,
    workspaceHash: options.workspaceHash,
    lastSessionId: options.lastSessionId ?? null,
  });
}

export async function runReadySequenceWithHost(options: {
  onboardingDone: boolean;
  sessionPersistenceEnabled: boolean;
  workspaceRoot?: string;
  workspaceHash: string;
  lastSessionId?: string;
  readIndex: () => Promise<SessionIndex>;
  tryRestoreSavedSession: (
    sessionId: string,
    source: "active" | "workspace-fallback",
  ) => Promise<boolean>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  showOnboarding: () => void;
  logReady: (details: {
    workspaceRoot: string | null;
    workspaceHash: string;
    lastSessionId: string | null;
  }) => void;
  postLicenseRequired: (feature: "sessionPersistence") => void;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  logRestoreMissed: (details: { workspaceHash: string }) => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
  onSessionStart?: ReadySequenceRunnerBindings["onSessionStart"];
}): Promise<ReadySequenceAction> {
  const readyAction = await resolveReadySequenceAction({
    onboardingDone: options.onboardingDone,
    sessionPersistenceEnabled: options.sessionPersistenceEnabled,
    lastSessionId: options.lastSessionId,
    workspaceHash: options.workspaceHash,
    readIndex: options.readIndex,
    tryRestoreSavedSession: options.tryRestoreSavedSession,
    setActiveSessionId: options.setActiveSessionId,
  });

  await applyReadySequenceAction({
    readyAction,
    workspaceRoot: options.workspaceRoot,
    workspaceHash: options.workspaceHash,
    lastSessionId: options.lastSessionId,
    postOnboarding: options.showOnboarding,
    logReady: options.logReady,
    postLicenseRequired: options.postLicenseRequired,
    postState: options.postState,
    refreshWorkspaceStatus: options.refreshWorkspaceStatus,
    logRestoreMissed: options.logRestoreMissed,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    shouldRefreshSessionsList: options.shouldRefreshSessionsList,
    handleSessionsLoad: options.handleSessionsLoad,
    onSessionStart: options.onSessionStart,
  });

  return readyAction;
}
