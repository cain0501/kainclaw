export type ChatPromptIntent =
  | "chat"
  | "prompt_rewrite"
  | "derive_artifact"
  | "image_generate"
  | "image_edit";

const ACKNOWLEDGMENT_PATTERNS = [
  /^(好|好的|嗯|哦|哈|ok|okay|行|了解|明白|收到|谢谢|谢|nice|cool|great|perfect|thanks|thx)[\s!！。]*$/i,
];

const GENERATE_PATTERNS = [
  /生成.*(图|图片|海报|封面|头像)/i,
  /做(一张|个)?.*(图|图片|海报|封面|头像)/i,
  /画(一张|个)?.*(图|图片|海报|封面|头像)/i,
  /出(一张|个)?.*(图|图片|海报|封面|头像)/i,
  /^(生成|做|画|出)(一张|一个|个)?.*(图|图片|海报|封面|头像|插画|壁纸)/i,
  /(肖像|人像|婚礼照|婚纱照|海报|封面|插画|壁纸|产品图|头像)/i,
  /\b(generate|create|make|render)\b.*\b(image|photo|poster|cover|portrait)\b/i,
];

const EDIT_PATTERNS = [
  /把.*(改|调|换|加|去掉|删除|保留)/i,
  /(背景|脸|头|胸|花|颜色|光线|构图).*(改|调|换|加|去掉|删除|保留|真实一点|大一点|小一点)/i,
  /\b(edit|change|adjust|add|remove|replace|keep)\b/i,
];

const QUESTION_PATTERNS = [
  /[？?]$/,
  /(怎么|为什么|如何|解释|分析|是什么|什么意思|有没有|能不能)/,
  /\b(what|why|how|explain|analyze|meaning|can you)\b/i,
];

const HTML_REQUEST_PATTERNS = [
  /\bhtml\b/i,
  /<!DOCTYPE html>/i,
  /单文件(页面|网页)/i,
  /(首页原型|页面原型|落地页原型|可点击原型|交互原型|作品集首页|作品集页面|dashboard页面|dashboard原型)/i,
];

const HTML_CREATION_PATTERNS = [
  /(输出|给我|请只输出).*(html|页面|网页|原型)/i,
  /(第一行必须是|不要 markdown|不要解释)/i,
  /(做|创建|实现|生成|写|帮(我)?做|帮(我)?生成|帮(我)?创建|帮(我)?实现|来(一个|个)).*(首页|页面|网页|落地页|作品集|dashboard|原型|prototype)/i,
  /(首页原型|页面原型|落地页原型|可点击原型|交互原型|作品集首页|作品集页面)/i,
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

const STRONG_GENERATE_PATTERNS = [
  /按这版直接生成/i,
  /按这个提示词生成(图片|海报|封面|主视觉)?/i,
  /(直接|现在).*(生成|出)(图|图片|海报|封面)?/i,
  /帮我生成(一张|一个|个)?.*(图|图片|海报|封面|头像)/i,
  /\b(generate|render)\b.*\b(now|directly)\b/i,
];

const REWRITE_TARGET_PATTERNS = [
  /(提示词|prompt|brief|文案|方案)/i,
];

const REWRITE_ACTION_PATTERNS = [
  /(重写|优化|改写|润色|整理)/i,
  /写(一版|一份|个)?/i,
  /\b(rewrite|refine|polish|improve|draft|write)\b/i,
];

const REWRITE_CONTEXT_PATTERNS = [
  /(根据以上|以上内容|这段|这版|这个提示词|这份)/i,
];

const DERIVE_ARTIFACT_PATTERNS = [
  /(把|将).*(做成|改成|转成|变成|还原成).*(可点击|交互|html|页面|网页|原型|prototype)/i,
  /(做成|改成|转成|变成).*(可点击|交互|html|页面|网页|原型|prototype)/i,
  /(根据|基于|参考).*(图|图片|设计图|设计稿|界面图|效果图).*(生成|做|输出).*(html|页面|网页|原型|prototype)/i,
  /\b(convert|turn|recreate)\b.*\b(into|to)\b.*\b(html|page|webpage|prototype)\b/i,
  /\b(clickable|interactive)\b.*\b(html|page|prototype)\b/i,
];

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function matchesArtifactIntent(options: {
  text: string;
  requestPatterns: RegExp[];
  creationPatterns: RegExp[];
  exclusionPatterns: RegExp[];
}): boolean {
  return (
    matchesAnyPattern(options.text, options.requestPatterns) &&
    matchesAnyPattern(options.text, options.creationPatterns) &&
    !matchesAnyPattern(options.text, options.exclusionPatterns)
  );
}

export function determineChatPromptIntent(options: {
  prompt: string;
  explicitIntent?: "chat" | "image_generate";
  hasAttachments: boolean;
  hasRecentGeneratedImageContext: boolean;
}): ChatPromptIntent {
  const prompt = options.prompt.trim();
  if (options.explicitIntent === "image_generate") {
    return "image_generate";
  }
  if (options.explicitIntent === "chat") {
    return "chat";
  }

  const looksLikeQuestion = matchesAnyPattern(prompt, QUESTION_PATTERNS);
  const looksLikeHtmlArtifact = matchesArtifactIntent({
    text: prompt,
    requestPatterns: HTML_REQUEST_PATTERNS,
    creationPatterns: HTML_CREATION_PATTERNS,
    exclusionPatterns: ARTIFACT_ANALYSIS_EXCLUSION_PATTERNS,
  });
  const looksLikeSvgArtifact = matchesArtifactIntent({
    text: prompt,
    requestPatterns: SVG_REQUEST_PATTERNS,
    creationPatterns: SVG_CREATION_PATTERNS,
    exclusionPatterns: SVG_ANALYSIS_EXCLUSION_PATTERNS,
  });
  const looksLikeMermaidArtifact = matchesArtifactIntent({
    text: prompt,
    requestPatterns: MERMAID_REQUEST_PATTERNS,
    creationPatterns: MERMAID_CREATION_PATTERNS,
    exclusionPatterns: MERMAID_ANALYSIS_EXCLUSION_PATTERNS,
  });
  const looksLikeStructuredTextOutput =
    looksLikeHtmlArtifact || looksLikeSvgArtifact || looksLikeMermaidArtifact;
  const looksLikeStrongGenerate = matchesAnyPattern(prompt, STRONG_GENERATE_PATTERNS);
  const looksLikeGenerate = matchesAnyPattern(prompt, GENERATE_PATTERNS);
  const looksLikeEdit = matchesAnyPattern(prompt, EDIT_PATTERNS);
  const looksLikePromptRewrite =
    (
      matchesAnyPattern(prompt, REWRITE_TARGET_PATTERNS) &&
      matchesAnyPattern(prompt, REWRITE_ACTION_PATTERNS)
    ) ||
    (
      matchesAnyPattern(prompt, REWRITE_CONTEXT_PATTERNS) &&
      matchesAnyPattern(prompt, REWRITE_ACTION_PATTERNS) &&
      !looksLikeStrongGenerate &&
      !looksLikeEdit
    );
  const looksLikeDeriveArtifact =
    (options.hasAttachments || options.hasRecentGeneratedImageContext) &&
    matchesAnyPattern(prompt, DERIVE_ARTIFACT_PATTERNS);

  if (looksLikePromptRewrite) {
    return "prompt_rewrite";
  }

  if (looksLikeDeriveArtifact) {
    return "derive_artifact";
  }

  if (looksLikeStructuredTextOutput) {
    return "chat";
  }

  if (options.hasRecentGeneratedImageContext) {
    if ((looksLikeStrongGenerate || looksLikeGenerate) && !looksLikeEdit) {
      return "image_generate";
    }
    if (looksLikeQuestion && !looksLikeEdit) {
      return "chat";
    }
    if (matchesAnyPattern(prompt, ACKNOWLEDGMENT_PATTERNS)) {
      return "chat";
    }
    return "image_edit";
  }

  if (looksLikeEdit && options.hasAttachments) {
    return "image_edit";
  }
  if (looksLikeStrongGenerate || looksLikeGenerate || options.hasAttachments) {
    return "image_generate";
  }

  return "chat";
}
