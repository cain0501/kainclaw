export type ChatPromptIntent =
  | "chat"
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
  /^(生成|做|画|出)(一张|一个|个)?/i,
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

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
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
  const looksLikeGenerate = matchesAnyPattern(prompt, GENERATE_PATTERNS);
  const looksLikeEdit = matchesAnyPattern(prompt, EDIT_PATTERNS);

  if (options.hasRecentGeneratedImageContext) {
    if (looksLikeGenerate && !looksLikeEdit) {
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
  if (looksLikeGenerate || options.hasAttachments) {
    return "image_generate";
  }

  return "chat";
}
