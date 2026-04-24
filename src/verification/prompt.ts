import { VERIFICATION_AGENT_SYSTEM_PROMPT } from "../agent/built-in/verificationAgent";

export const VERIFICATION_SYSTEM_PROMPT = VERIFICATION_AGENT_SYSTEM_PROMPT;

export type VerificationVerdict = "PASS" | "FAIL" | "PARTIAL";

export const VERIFY_PLAN_REMINDER_CONFIG = {
  TURNS_BETWEEN_REMINDERS: 10,
} as const;

export type PendingPlanVerificationPromptOptions = {
  planFilePath: string;
  turnsSinceApproval: number;
};

export function buildPendingPlanVerificationSystemPrompt(
  baseSystemPrompt: string,
  options: PendingPlanVerificationPromptOptions,
): string {
  const reminder = `An approved plan from ExitPlanMode is still awaiting final execution verification.

Plan file: ${options.planFilePath}

It has been ${options.turnsSinceApproval} user turns since the plan was approved and verification still has not started.

Before you claim the approved plan is fully implemented, call VerifyPlanExecution. If VerifyPlanExecution is unavailable in the current turn, call RunVerification instead. Your own summary does not count as verification.`;

  return `${baseSystemPrompt}\n\n${reminder}`;
}

export function extractVerificationVerdict(text: string): VerificationVerdict | null {
  const match = text.match(/VERDICT:\s*(PASS|FAIL|PARTIAL)\b/i);
  return (match?.[1]?.toUpperCase() as VerificationVerdict | undefined) ?? null;
}
