export type ArtifactPromptTarget = "html" | "svg" | "mermaid" | null;

const HTML_REQUEST_PATTERNS = [
  /\bhtml\b/i,
  /<!DOCTYPE html>/i,
  /单文件(页面|网页)/i,
  /(首页原型|页面原型|落地页原型|可点击原型|交互原型|作品集首页|作品集页面|dashboard页面|dashboard原型|官网首页|产品官网|产品官网首页|专题页|专题页面|首屏页面|首屏设计|产品介绍页|双栏页面|双栏介绍页|landing page|hero section)/i,
];

const HTML_CREATION_PATTERNS = [
  /(输出|给我|请只输出).*(html|页面|网页|原型)/i,
  /(第一行必须是|不要 markdown|不要解释)/i,
  /(做|创建|实现|生成|写|帮(我)?做|帮(我)?生成|帮(我)?创建|帮(我)?实现|来(一个|个)).*(首页|页面|网页|落地页|作品集|dashboard|原型|prototype|官网|首屏|专题页|介绍页|双栏)/i,
  /(首页原型|页面原型|落地页原型|可点击原型|交互原型|作品集首页|作品集页面|官网首页|产品官网|专题页|首屏页面|首屏设计|产品介绍页|双栏页面|双栏介绍页)/i,
];

const ARTIFACT_ANALYSIS_EXCLUSION_PATTERNS = [
  /(分析|评价|评估|比较|对比|讨论|解释|看看|说说|审查).*(首页|页面|原型|布局|设计|作品集|图表|流程图|架构图|图标|矢量图)/i,
  /(首页|页面|原型|布局|设计|作品集|流程图|架构图|图表|图标).*(怎么样|好不好|有什么问题|优缺点|怎么看|合不合理)/i,
  /这(个|类|份|种).*(首页|页面|设计|原型|布局|流程图|架构图|图表|图标)/i,
];

const SVG_REQUEST_PATTERNS = [
  /\bsvg\b/i,
  /饼图|柱状图|折线图|矢量图|图标/i,
];

const SVG_CREATION_PATTERNS = [
  /(输出|给我|请只输出).*(svg|饼图|柱状图|折线图|矢量图|图标|图表)/i,
  /(做|生成|创建|写|帮(我)?做|帮(我)?生成|来(一个|个)).*(饼图|柱状图|折线图|矢量图|图标|数据图表)/i,
  /svg格式|输出svg|svg图/i,
];

const SVG_ANALYSIS_EXCLUSION_PATTERNS = [
  /(分析|评价|评估|比较|对比|讨论|解释|看看).*(饼图|柱状图|折线图|图表|图标|矢量图)/i,
  /(这(个|类|份|种)).*(饼图|图表|图标)/i,
  /(饼图|柱状图|图表|图标).*(怎么样|好不好|有什么问题|优缺点)/i,
];

const MERMAID_REQUEST_PATTERNS = [
  /\bmermaid\b/i,
  /流程图|架构图|时序图|状态图/i,
];

const MERMAID_CREATION_PATTERNS = [
  /(输出|给我|请只输出).*(mermaid|流程图|架构图|时序图|状态图|关系图)/i,
  /(做|生成|创建|画|帮(我)?做|帮(我)?画|来(一个|个)).*(流程图|架构图|时序图|状态图|关系图|思维导图)/i,
  /mermaid格式|用mermaid|mermaid代码/i,
];

const MERMAID_ANALYSIS_EXCLUSION_PATTERNS = [
  /(分析|评价|评估|比较|对比|讨论|解释|看看).*(流程图|架构图|时序图|状态图|关系图)/i,
  /(这(个|类|份|种)).*(流程图|架构图|图)/i,
  /(流程图|架构图|时序图).*(怎么样|好不好|有什么问题|合不合理)/i,
];

const INTERACTIVE_PATTERNS = [
  /可点击|交互|interactive|clickable/i,
  /原型|prototype/i,
  /tab|modal|accordion|filter/i,
];

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function matchesArtifactIntent(options: {
  prompt: string;
  requestPatterns: RegExp[];
  creationPatterns: RegExp[];
  exclusionPatterns: RegExp[];
}): boolean {
  return (
    matchesAnyPattern(options.prompt, options.requestPatterns) &&
    matchesAnyPattern(options.prompt, options.creationPatterns) &&
    !matchesAnyPattern(options.prompt, options.exclusionPatterns)
  );
}

export function detectArtifactPromptTarget(prompt: string): ArtifactPromptTarget {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return null;
  }

  const requestsHtmlTweakBridge =
    /\bhtml\b/i.test(normalizedPrompt) &&
    /__edit_mode_available|__activate_edit_mode|__deactivate_edit_mode|__edit_mode_set_keys|postmessage|tweaks bridge/i.test(
      normalizedPrompt,
    );
  if (requestsHtmlTweakBridge) {
    return "html";
  }

  if (matchesArtifactIntent({
    prompt: normalizedPrompt,
    requestPatterns: SVG_REQUEST_PATTERNS,
    creationPatterns: SVG_CREATION_PATTERNS,
    exclusionPatterns: SVG_ANALYSIS_EXCLUSION_PATTERNS,
  })) {
    return "svg";
  }

  if (matchesArtifactIntent({
    prompt: normalizedPrompt,
    requestPatterns: MERMAID_REQUEST_PATTERNS,
    creationPatterns: MERMAID_CREATION_PATTERNS,
    exclusionPatterns: MERMAID_ANALYSIS_EXCLUSION_PATTERNS,
  })) {
    return "mermaid";
  }

  if (matchesArtifactIntent({
    prompt: normalizedPrompt,
    requestPatterns: HTML_REQUEST_PATTERNS,
    creationPatterns: HTML_CREATION_PATTERNS,
    exclusionPatterns: ARTIFACT_ANALYSIS_EXCLUSION_PATTERNS,
  })) {
    return "html";
  }

  return null;
}

export function shouldRequireInteractivePrototype(prompt: string): boolean {
  return matchesAnyPattern(prompt, INTERACTIVE_PATTERNS);
}

function buildHtmlArtifactPrompt(prompt: string): string {
  const lines = [
    prompt.trim(),
    "",
    "[Internal artifact output contract]",
    "- Return only one complete single-file HTML document.",
    "- The very first line must be <!DOCTYPE html>.",
    "- Do not add markdown fences.",
    "- Do not add explanation before or after the HTML.",
    "- Keep all sections statically visible after load.",
    "- Do not use reveal animations.",
    "- Do not use IntersectionObserver.",
    "- Do not leave any section at opacity: 0 by default.",
    "- Do not rely on scrolling to reveal content.",
    "- Do not use a fixed overlay that blocks the main content.",
  ];

  if (shouldRequireInteractivePrototype(prompt)) {
    lines.push(
      "- This is a clickable prototype, not a static mockup.",
      "- Include at least one real interaction implemented with vanilla JavaScript.",
      "- Acceptable interactions include tabs, modal dialogs, accordions, step switches, or filters.",
      "- The interaction must work immediately after the page loads.",
    );
  }

  return lines.join("\n");
}

function buildSvgArtifactPrompt(prompt: string): string {
  return [
    prompt.trim(),
    "",
    "[Internal artifact output contract]",
    "- Return only one complete SVG document.",
    "- Do not add markdown fences.",
    "- Do not add explanation before or after the SVG.",
    "- Keep the output self-contained with no external assets.",
    "- Include a valid viewBox and renderable content.",
  ].join("\n");
}

function buildMermaidArtifactPrompt(prompt: string): string {
  return [
    prompt.trim(),
    "",
    "[Internal artifact output contract]",
    "- Return only Mermaid diagram source.",
    "- Do not add explanation before or after the diagram.",
    "- Prefer a fenced mermaid code block or raw Mermaid source only.",
    "- Do not wrap the diagram in HTML.",
  ].join("\n");
}

export function augmentArtifactPrompt(prompt: string): string {
  const target = detectArtifactPromptTarget(prompt);
  if (target === "html") {
    return buildHtmlArtifactPrompt(prompt);
  }
  if (target === "svg") {
    return buildSvgArtifactPrompt(prompt);
  }
  if (target === "mermaid") {
    return buildMermaidArtifactPrompt(prompt);
  }

  return prompt;
}

export function shouldDisableToolsForArtifactPrompt(prompt: string): boolean {
  return detectArtifactPromptTarget(prompt) === "html";
}
