const ENGLISH_SWARM_INTENT_PATTERNS = [
  /\bspawn_agent\b/i,
  /\bwait_for_agents\b/i,
  /\bsend_message\b/i,
  /\bswarm\b/i,
  /\bsub-?agents?\b/i,
  /\bparallel\s+(?:workers?|agents?)\b/i,
  /\bmultiple\s+(?:workers?|agents?)\b/i,
  /\b(?:use|spawn|start|launch|create|run|delegate(?:\s+to)?|split(?:\s+into)?)\s+(?:\d+\s+|multiple\s+|several\s+|some\s+|parallel\s+)?(?:workers?|agents?)\b/i,
  /\b(?:workers?|agents?)\s+(?:to|for)\s+(?:parallel|delegate|analy[sz]e|research|inspect|read|work)\b/i,
] as const;

const CHINESE_SWARM_INTENT_PHRASES = [
  "派一个worker",
  "派两个worker",
  "派一个 worker",
  "派两个 worker",
  "派出worker",
  "派出 worker",
  "多个worker",
  "多个 worker",
  "派一个agent",
  "派两个agent",
  "派一个 agent",
  "派两个 agent",
  "派出agent",
  "派出 agent",
  "多个agent",
  "多个 agent",
  "子agent",
  "子 agent",
  "子智能体",
  "多智能体",
  "分头分析",
  "分头处理",
  "分头研究",
  "分头执行",
  "分头查",
  "并行分析",
  "并行处理",
  "并行研究",
  "并行执行",
  "并行阅读",
  "并行查",
] as const;

export function hasExplicitSwarmIntent(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!normalizedPrompt) {
    return false;
  }

  if (ENGLISH_SWARM_INTENT_PATTERNS.some(pattern => pattern.test(normalizedPrompt))) {
    return true;
  }

  const normalizedLowerPrompt = normalizedPrompt.toLowerCase();
  return CHINESE_SWARM_INTENT_PHRASES.some(phrase => normalizedLowerPrompt.includes(phrase));
}
