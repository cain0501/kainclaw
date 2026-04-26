import {
  applyMoodDelta,
  generateCompanion,
  getIdleDecay,
} from "./companion/companionEngine";
import type { CompanionData, CompanionState } from "./companion/companionTypes";

export function initializeCompanionData(options: {
  machineId: string;
  hasLicense: boolean;
  storedCompanion?: CompanionData;
  now?: number;
}): CompanionData {
  const generated = generateCompanion(options.machineId, options.hasLicense);

  let companion: CompanionData = {
    ...generated,
    moodLevel: options.storedCompanion?.moodLevel ?? generated.moodLevel,
    bondLevel: options.storedCompanion?.bondLevel ?? generated.bondLevel,
    totalConversations:
      options.storedCompanion?.totalConversations ?? generated.totalConversations,
    lastActiveAt: options.storedCompanion?.lastActiveAt ?? generated.lastActiveAt,
  };

  const decay = getIdleDecay(companion);
  if (decay > 0) {
    companion = {
      ...applyMoodDelta(companion, -decay),
      lastActiveAt: options.now ?? Date.now(),
    };
  }

  return companion;
}

export function updateCompanionMoodData(options: {
  companionData?: CompanionData;
  delta: number;
  countConversation?: boolean;
  now?: number;
}): CompanionData | undefined {
  if (!options.companionData) {
    return undefined;
  }

  const totalConversations =
    options.companionData.totalConversations + (options.countConversation ? 1 : 0);

  return {
    ...applyMoodDelta(
      {
        ...options.companionData,
        totalConversations,
      },
      options.delta,
    ),
    totalConversations,
    lastActiveAt: options.now ?? Date.now(),
  };
}

export async function persistCompanionData(options: {
  companionData?: CompanionData;
  setState: (key: string, value: CompanionData) => Promise<void>;
  key: string;
}): Promise<boolean> {
  if (!options.companionData) {
    return false;
  }

  await options.setState(options.key, options.companionData);
  return true;
}

export type CompanionHostBindings = {
  initializeCompanion: () => Promise<void>;
  postCompanionState: (state: CompanionState) => void;
  updateCompanionMood: (delta: number, countConversation?: boolean) => Promise<void>;
};

export type CompanionHostBindingFactory = (options: {
  getCompanionData: () => CompanionData | undefined;
  setCompanionData: (companionData: CompanionData | undefined) => void;
}) => CompanionHostBindings;

export function createCompanionHostBindings(options: {
  getMachineId: () => string;
  hasLicense: () => boolean;
  getStoredCompanion: () => CompanionData | undefined;
  getCompanionData: () => CompanionData | undefined;
  setCompanionData: (companionData: CompanionData | undefined) => void;
  persistCompanionData: (companionData: CompanionData | undefined) => Promise<void>;
  postCompanionInit: (companionData: CompanionData | undefined) => void;
  postCompanionState: (state: CompanionState) => void;
  postCompanionMood: (
    delta: number,
    companionData: CompanionData | undefined,
  ) => void;
}): CompanionHostBindings {
  return {
    initializeCompanion: async () => {
      const companionData = initializeCompanionData({
        machineId: options.getMachineId(),
        hasLicense: options.hasLicense(),
        storedCompanion: options.getStoredCompanion(),
      });
      options.setCompanionData(companionData);
      await options.persistCompanionData(companionData);
      options.postCompanionInit(companionData);
    },
    postCompanionState: state => {
      options.postCompanionState(state);
    },
    updateCompanionMood: async (delta, countConversation = false) => {
      const companionData = updateCompanionMoodData({
        companionData: options.getCompanionData(),
        delta,
        countConversation,
      });
      options.setCompanionData(companionData);
      await options.persistCompanionData(companionData);
      options.postCompanionMood(delta, companionData);
    },
  };
}

export function createCompanionHostBindingsFactory(options: {
  getMachineId: () => string;
  hasLicense: () => boolean;
  getStoredCompanion: () => CompanionData | undefined;
  persistCompanionData: (
    companionData: CompanionData | undefined,
  ) => Promise<void>;
  postCompanionInit: (companionData: CompanionData | undefined) => void;
  postCompanionState: (state: CompanionState) => void;
  postCompanionMood: (
    delta: number,
    companionData: CompanionData | undefined,
  ) => void;
}): CompanionHostBindingFactory {
  return state =>
    createCompanionHostBindings({
      getMachineId: options.getMachineId,
      hasLicense: options.hasLicense,
      getStoredCompanion: options.getStoredCompanion,
      getCompanionData: state.getCompanionData,
      setCompanionData: state.setCompanionData,
      persistCompanionData: options.persistCompanionData,
      postCompanionInit: options.postCompanionInit,
      postCompanionState: options.postCompanionState,
      postCompanionMood: options.postCompanionMood,
    });
}
