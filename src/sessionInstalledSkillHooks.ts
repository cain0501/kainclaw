import type { HookDefinition } from "./hooksRegistry";

function dedupeHooks(hooks: HookDefinition[]): HookDefinition[] {
  const merged = new Map<string, HookDefinition>();
  for (const hook of hooks) {
    merged.set(hook.id, hook);
  }
  return [...merged.values()];
}

export function getSessionInstalledSkillHooks(
  store: Map<string, HookDefinition[]>,
  conversationKey: string,
): HookDefinition[] {
  return [...(store.get(conversationKey) ?? [])];
}

export function registerSessionInstalledSkillHooks(
  store: Map<string, HookDefinition[]>,
  conversationKey: string,
  hooks: HookDefinition[],
): HookDefinition[] {
  const merged = dedupeHooks([
    ...(store.get(conversationKey) ?? []),
    ...hooks,
  ]);
  store.set(conversationKey, merged);
  return merged;
}

export function clearSessionInstalledSkillHooks(
  store: Map<string, HookDefinition[]>,
  conversationKey: string,
): void {
  store.delete(conversationKey);
}

export function clearAllSessionInstalledSkillHooks(
  store: Map<string, HookDefinition[]>,
): void {
  store.clear();
}
