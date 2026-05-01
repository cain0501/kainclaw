export type AppLanguage = "zh-CN" | "en-US";

export type ElectronDialogStrings = {
  needConfirmation: string;
  cancel: string;
  reject: string;
  confirmExecute: string;
  otherLabel: string;
  otherDescription: string;
  customAnswerPlaceholder: string;
  optionalNote: string;
  notePlaceholder: string;
  reviewTitle: string;
  notAnsweredYet: string;
  answerAllBeforeSubmit: string;
  answerCurrentBeforeContinue: string;
  submitAnswers: string;
  reviewAnswers: string;
  nextQuestion: string;
  submitChip: string;
  noteLabel: string;
};

export type ElectronSettingsStrings = {
  interfaceLanguageTitle: string;
  interfaceLanguageDescription: string;
  chatModelsTitle: string;
  chatModelsDescription: string;
  addProvider: string;
  noChatModels: string;
  currentInUse: string;
  edit: string;
  use: string;
  addProviderFormTitle: string;
  providerType: string;
  providerAlias: string;
  providerAliasPlaceholder: string;
  providerModel: string;
  apiEndpointUrl: string;
  apiKey: string;
  save: string;
  imageModelsTitle: string;
  imageModelsDescription: string;
  addImageModel: string;
  imageModelKeySaved: string;
  imageModelKeyMissing: string;
  imageModelEndpoint: string;
  imageModelName: string;
  authMode: string;
  responseFormat: string;
  imageModelApiKeyPlaceholder: string;
  imageModelSave: string;
  imageModelSaveChanges: string;
  authModeHint: string;
  licenseActivated: string;
  licenseInactive: string;
};

export type ElectronShellStrings = {
  surfaceTextMap: Record<string, string>;
  defaultSessionTitle: string;
  sessionSectionTitle: string;
  noSessions: string;
  newSessionTooltip: string;
  renameSessionTitle: string;
  renameSessionDescription: string;
  renameSessionPlaceholder: string;
  exportSessionTitle: string;
  deleteSessionTitle: string;
  deleteSessionConfirm: string;
  exportSessionAlertPrefix: string;
  workspaceSectionTitle: string;
  settingsLabel: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  composerPlaceholder: string;
  composerBusyPlaceholder: string;
  composerBackgroundPlaceholder: string;
  composerImagePlaceholder: string;
  composerBusyStatus: string;
  composerBackgroundStatus: string;
  backgroundTaskBubble: string;
  imageModeBadge: string;
  imageModeCopy: string;
  imageModeCopyWithReferences: string;
  imageModeActivate: string;
  imageModeActive: string;
  imageModeExit: string;
  imageModePromptPlaceholder: string;
  actionGenerateImage: string;
  actionEditImage: string;
  actionPromptLibrary: string;
  actionReferenceImages: string;
  providerLabelLoading: string;
  providerLabelUnset: string;
  workspaceBadgePick: string;
  workspaceBadgeTitlePick: string;
  workspaceTooltipCurrent: string;
  workspaceTooltipSelected: string;
  workspaceTooltipDetail: string;
  workspaceStatusGitRepo: string;
  workspaceStatusPathMissing: string;
  workspaceStatusNotGit: string;
  workspaceStatusAmbiguous: string;
  workspaceStatusUnset: string;
  workspaceLineCurrent: string;
  workspaceLineEffective: string;
  workspaceNotSet: string;
  licenseActivatedBadge: string;
  editImageHint: string;
  toolRunningPrefix: string;
  thinkingSummaryTitle?: string;
  generatedImageEdit: string;
  generatedImageDownload: string;
  imagePendingIntroGenerate: string;
  imagePendingIntroEdit: string;
  imagePendingBadgeGenerate: string;
  imagePendingBadgeEdit: string;
  imagePendingCountUnit: string;
  imagePendingCreating: string;
  imagePendingPromptFallback: string;
  imagePendingLoaderTitleGenerate: string;
  imagePendingLoaderTitleEdit: string;
  imagePendingLoaderSubtitle: string;
  imagePendingLoaderSubtitleWithModel: string;
};

const ELECTRON_SHELL_SURFACE_TEXT_PAIRS = [
  ["选择 AI 提供商开始使用", "Choose an AI provider to get started"],
  ["模型名称", "Model name"],
  ["推荐", "Recommended"],
  ["验证并继续", "Verify and continue"],
  ["验证成功，正在进入...", "Verification succeeded. Entering..."],
  ["无需 API Key", "API key not required"],
  ["推荐", "Recommended"],
  ["本地调用", "Local CLI"],
  ["自定义", "Custom"],
  ["提示词库", "Prompt library"],
  ["参考图搜索", "Reference search"],
  ["图像编辑", "Image editor"],
  ["版本", "Versions"],
  ["添加参考图", "Add reference image"],
  ["识图反推提示词", "Infer prompt from image"],
  ["当前会把目标图作为第一张参考图。", "The target image will be used as the first reference image."],
  ["描述编辑，例如：背景更真实一点，花艺加密，保持人物姿态不变", "Describe the edit, for example: make the background more realistic, add denser florals, keep the subject pose unchanged."],
  ["发送编辑", "Submit edit"],
  ["图像工作台", "Image workspace"],
  ["图像模型未配置", "Image model not configured"],
  ["先去设置页完成图像模型配置，之后再回来生成图片。", "Finish image model setup in Settings first, then come back to generate images."],
  ["去设置模型", "Open model settings"],
  ["图像工作流编排", "Image workflow orchestration"],
  ["编排工作流", "Orchestrate workflow"],
  ["生成尺寸", "Output size"],
  ["批量数量", "Batch count"],
  ["返回格式", "Response format"],
  ["Prompt 提示词", "Prompt"],
  ["支持多行。每一行会单独进入历史记录。", "Multi-line input is supported. Each line is stored in history separately."],
  ["参考图组", "Reference images"],
  ["清空全部参考图", "Clear all reference images"],
  ["当前已加载参考图，将走编辑模式。", "Reference images are loaded. Edit mode will be used."],
  ["清空参考图组", "Clear reference set"],
  ["生成 / 编辑", "Generate / Edit"],
  ["重生成", "Rerun"],
  ["停止生成", "Stop"],
  ["先配置参数，然后生成图片。上传参考图后会自动走编辑模式。", "Configure parameters first, then generate images. Uploading references automatically switches to edit mode."],
  ["提示词历史", "Prompt history"],
  ["这里只记录你实际点击“生成 / 编辑”提交过的提示词，不是图片会话。", "This only records prompts you actually submitted with “Generate / Edit”, not the image conversation itself."],
  ["清空历史", "Clear history"],
  ["历史记录", "History"],
  ["清空结果", "Clear results"],
  ["生成结果会显示在这里。", "Generated results will appear here."],
  ["单击“二次编辑”可继续改当前图片，单击“变体”会以当前图片为参考再生成一张。", "Click “Edit again” to keep editing the current image, or “Variant” to generate a new image from it."],
  ["二次编辑", "Edit again"],
  ["存库", "Save"],
  ["变体", "Variant"],
  ["当前没有带入目标图", "No target image is attached"],
  ["当前没有明确的素材目标。", "No clear material target is set yet."],
  ["先说明你想补什么素材，或先确定一张要编辑的目标图，再找参考图。", "Explain what material you want to add, or choose the image you want to edit before searching for references."],
  ["当前逻辑：先由聊天模型整理当前图片任务并生成资料关键词，你确认后再去公开图源里找可用参考图。", "Current flow: the chat model organizes the current image task and produces research keywords first. After you confirm them, you search public image sources for usable references."],
  ["当前搜索源：百度图片。后续优化方向仍是“先搜网页资料，再从资料页抽视觉线索或可用图片”，并继续把 Google / 小红书这类信息搜索源接入同一个入口。", "Current source: Baidu Images. The longer-term direction is still “search web materials first, then extract visual clues or usable images from those pages,” and keep bringing sources like Google and Xiaohongshu into the same entry point."],
  ["确认检索词后，再开始搜图。", "Confirm the search queries, then start looking for references."],
  ["你可以先改检索词，再开始搜图。", "You can adjust the search queries first, then start searching."],
  ["建议检索词", "Suggested queries"],
  ["检索词", "Search queries"],
  ["重新建议关键词", "Regenerate suggested queries"],
  ["直接生成", "Generate directly"],
  ["开始搜图", "Search references"],
  ["当前图片任务", "Current image task"],
  ["聊天任务", "Chat task"],
  ["客户可见结果固定展示为中文在前、英文在后。", "Client-visible results are shown with Chinese first and English second."],
  ["中文提示词", "Chinese prompt"],
  ["插入中文", "Insert Chinese"],
  ["保存到提示词库", "Save to prompt library"],
  ["查看全部提示词", "View all prompts"],
  ["全部分类", "All categories"],
  ["全部提示词", "All prompts"],
  ["我的喜欢", "Favorites"],
  ["例如：rose bouquet wedding boutonniere", "Example: rose bouquet wedding boutonniere"],
  ["动物", "Animals"],
  ["人像", "Portrait"],
  ["产品", "Product"],
  ["风景", "Landscape"],
  ["自定义", "Custom"],
  ["模型名称", "Model name"],
  ["验证并继续", "Verify and continue"],
  ["验证成功，正在进入...", "Verification succeeded. Entering..."],
  ["无需 API Key", "API key not required"],
  ["错误: 请输入有效的 API Key（至少 8 位）", "Error: enter a valid API key (at least 8 characters)."],
  ["错误: 请填写 API 端点 URL", "Error: enter the API endpoint URL."],
  ["图像编辑", "Image editor"],
  ["版本", "Versions"],
  ["添加参考图", "Add reference image"],
  ["识图反推提示词", "Infer prompt from image"],
  ["当前会把目标图作为第一张参考图。", "The target image will be used as the first reference image."],
  ["描述编辑，例如：背景更真实一点，花艺加密，保持人物姿态不变", "Describe the edit, for example: make the background more realistic, add denser florals, keep the subject pose unchanged."],
  ["发送编辑", "Submit edit"],
  ["提示词库", "Prompt library"],
  ["参考图搜索", "Reference search"],
  ["我的喜欢", "Favorites"],
  ["搜索标题、提示词、标签", "Search titles, prompts, tags"],
  ["图片反推", "Infer from image"],
  ["保存当前提示词", "Save current prompt"],
  ["当前还没有建议检索词。你也可以手动输入。", "No suggested queries yet. You can also type your own."],
  ["加入参考图", "Add as reference"],
  ["来源", "Source"],
  ["当前没有搜到合适的公开素材图。可以先改检索词，再重新查一次。", "No suitable public reference images were found. Adjust the query and try again."],
  ["建议检索词", "Suggested queries"],
  ["检索词", "Search queries"],
  ["重新建议关键词", "Regenerate suggested queries"],
  ["直接生成", "Generate directly"],
  ["开始搜图", "Search references"],
  ["当前图片任务", "Current image task"],
  ["编辑弹层", "Editor modal"],
  ["聊天任务", "Chat task"],
  ["图片反推提示词", "Inferred prompt"],
  ["客户可见结果固定展示为中文在前、英文在后。", "Client-visible results are always shown with Chinese first and English second."],
  ["正在根据图片反推双语提示词...", "Inferring a bilingual prompt from the image..."],
  ["中文提示词", "Chinese prompt"],
  ["插入中文", "Insert Chinese"],
  ["插入英文", "Insert English"],
  ["保存到提示词库", "Save to prompt library"],
  ["收藏页里没有匹配结果", "No matching favorites"],
  ["还没有收藏的提示词", "No favorite prompts yet"],
  ["当前筛选条件下没有命中的收藏提示词。", "No favorite prompts matched the current filters."],
  ["先在提示词卡片上点收藏，它们就会集中出现在这里。", "Favorite prompt cards first and they will appear here."],
  ["清空筛选", "Clear filters"],
  ["查看全部提示词", "View all prompts"],
  ["没有匹配的提示词", "No matching prompts"],
  ["调整搜索条件，或上传图片做反推。", "Adjust the filters or upload an image to infer a prompt."],
  ["图像工作台", "Image workspace"],
  ["图像模型未配置", "Image model not configured"],
  ["先去设置页完成图像模型配置，之后再回来生成图片。", "Finish image model setup in Settings first, then come back to generate images."],
  ["去设置模型", "Open model settings"],
  ["图像工作流编排", "Image workflow orchestration"],
  ["编排工作流", "Orchestrate workflow"],
  ["生成尺寸", "Output size"],
  ["批量数量", "Batch count"],
  ["返回格式", "Response format"],
  ["Prompt 提示词", "Prompt"],
  ["支持多行。每一行会单独进入历史记录。", "Multi-line input is supported. Each line will be recorded in history separately."],
  ["参考图组", "Reference images"],
  ["清空全部参考图", "Clear all reference images"],
  ["当前已加载参考图，将走编辑模式。", "Reference images are loaded. Edit mode will be used."],
  ["清空参考图组", "Clear reference set"],
  ["生成 / 编辑", "Generate / Edit"],
  ["重生成", "Rerun"],
  ["停止生成", "Stop"],
  ["先配置参数，然后生成图片。上传参考图后会自动走编辑模式。", "Configure the parameters first, then generate images. Uploading references automatically switches to edit mode."],
  ["提示词历史", "Prompt history"],
  ["这里只记录你实际点击“生成 / 编辑”提交过的提示词，不是图片会话。", "This only records prompts you actually submitted with “Generate / Edit”, not the image conversation itself."],
  ["清空历史", "Clear history"],
  ["历史记录", "History"],
  ["清空结果", "Clear results"],
  ["生成结果会显示在这里。", "Generated results will appear here."],
  ["单击“二次编辑”可继续改当前图片，单击“变体”会以当前图片为参考再生成一张。", "Click “Edit again” to continue editing the current image, or “Variant” to generate a new variation from it."],
  ["下载", "Download"],
  ["二次编辑", "Edit again"],
  ["存库", "Save"],
  ["变体", "Variant"],
  ["编辑编排", "Edit plan"],
  ["新图编排", "New-image plan"],
  ["清空编排", "Clear plan"],
  ["任务摘要：", "Intent summary:"],
  ["最终执行提示词：", "Final execution prompt:"],
  ["下一步建议：", "Suggested next step:"],
  ["建议补充的素材关键词", "Suggested material keywords"],
  ["当前不需要额外补素材，可直接执行。", "No extra material is needed right now. You can run the prompt directly."],
  ["暂无已提交的提示词。点击“生成 / 编辑”后会记录在这里。", "No submitted prompts yet. They will appear here after you click “Generate / Edit”."],
  ["删除这条历史", "Delete this history entry"],
  ["清空所有结果批次？", "Clear all result batches?"],
  ["删除这张图片结果？", "Delete this image result?"],
  ["选择文件夹", "Choose folder"],
  ["历史结果", "History"],
  ["设置模型", "Configure model"],
  ["纤基流动", "SiliconFlow"],
  ["硅基流动", "SiliconFlow"],
];

function buildShellSurfaceTextMap(language: AppLanguage): Record<string, string> {
  return Object.fromEntries(
    ELECTRON_SHELL_SURFACE_TEXT_PAIRS.map(([zh, en]) =>
      language === "en-US" ? [zh, en] : [en, zh],
    ),
  );
}

const ELECTRON_DIALOG_STRINGS: Record<AppLanguage, ElectronDialogStrings> = {
  "zh-CN": {
    needConfirmation: "需要确认",
    cancel: "取消",
    reject: "拒绝",
    confirmExecute: "确认执行",
    otherLabel: "其他",
    otherDescription: "输入自定义答案。",
    customAnswerPlaceholder: "自定义答案",
    optionalNote: "可选备注",
    notePlaceholder: "给 KainClaw 的补充说明",
    reviewTitle: "检查你的答案",
    notAnsweredYet: "尚未作答",
    answerAllBeforeSubmit: "请先完成所有问题后再提交。",
    answerCurrentBeforeContinue: "请先回答当前问题再继续。",
    submitAnswers: "提交答案",
    reviewAnswers: "检查答案",
    nextQuestion: "下一题",
    submitChip: "提交",
    noteLabel: "备注：",
  },
  "en-US": {
    needConfirmation: "Need confirmation",
    cancel: "Cancel",
    reject: "Reject",
    confirmExecute: "Confirm",
    otherLabel: "Other",
    otherDescription: "Type a custom answer.",
    customAnswerPlaceholder: "Custom answer",
    optionalNote: "Optional note",
    notePlaceholder: "Add context for KainClaw",
    reviewTitle: "Review your answers",
    notAnsweredYet: "Not answered yet",
    answerAllBeforeSubmit: "Please answer all questions before submitting.",
    answerCurrentBeforeContinue: "Please answer the current question before continuing.",
    submitAnswers: "Submit answers",
    reviewAnswers: "Review answers",
    nextQuestion: "Next question",
    submitChip: "Submit",
    noteLabel: "Note:",
  },
};

export function normalizeAppLanguage(value?: string): AppLanguage {
  const normalized = value?.trim().toLowerCase();
  if (normalized?.startsWith("en")) {
    return "en-US";
  }
  return "zh-CN";
}

export function getElectronDialogStrings(language?: string): ElectronDialogStrings {
  return ELECTRON_DIALOG_STRINGS[normalizeAppLanguage(language)];
}

const ELECTRON_SETTINGS_STRINGS: Record<AppLanguage, ElectronSettingsStrings> = {
  "zh-CN": {
    interfaceLanguageTitle: "界面语言",
    interfaceLanguageDescription: "Electron 对话框和宿主提示会跟随这个语言。",
    chatModelsTitle: "聊天模型",
    chatModelsDescription: "用于对话、代码、MCP、Agent 等主流程。",
    addProvider: "+ 添加提供商",
    noChatModels: "尚未配置聊天模型。先添加 Claude、GPT、DeepSeek 等日常对话模型。",
    currentInUse: "当前使用",
    edit: "编辑",
    use: "使用",
    addProviderFormTitle: "添加新提供商",
    providerType: "类型",
    providerAlias: "别名",
    providerAliasPlaceholder: "我的提供商",
    providerModel: "模型",
    apiEndpointUrl: "API 端点 URL",
    apiKey: "API Key",
    save: "保存",
    imageModelsTitle: "图像模型",
    imageModelsDescription: "用于 Image Lab 读取当前使用中的图像模型配置。",
    addImageModel: "+ 添加图像模型",
    imageModelKeySaved: "Key 已保存",
    imageModelKeyMissing: "未配置 Key",
    imageModelEndpoint: "接口地址",
    imageModelName: "图像模型",
    authMode: "鉴权方式",
    responseFormat: "返回格式",
    imageModelApiKeyPlaceholder: "填写 API 密钥",
    imageModelSave: "保存图像模型",
    imageModelSaveChanges: "保存修改",
    authModeHint: "鉴权方式说明：大多数官方接口选 Bearer，部分中转站选 Raw。",
    licenseActivated: "已激活 / Pro",
    licenseInactive: "尚未激活 License",
  },
  "en-US": {
    interfaceLanguageTitle: "Interface language",
    interfaceLanguageDescription: "Electron dialogs and host-owned prompts follow this language.",
    chatModelsTitle: "Chat models",
    chatModelsDescription: "Used for chat, coding, MCP, agents, and the main workflow.",
    addProvider: "+ Add provider",
    noChatModels: "No chat model is configured yet. Add Claude, GPT, DeepSeek, or another daily-use chat model first.",
    currentInUse: "Current",
    edit: "Edit",
    use: "Use",
    addProviderFormTitle: "Add provider",
    providerType: "Type",
    providerAlias: "Alias",
    providerAliasPlaceholder: "My provider",
    providerModel: "Model",
    apiEndpointUrl: "API endpoint URL",
    apiKey: "API key",
    save: "Save",
    imageModelsTitle: "Image models",
    imageModelsDescription: "Used by Image Lab to read the currently active image model configuration.",
    addImageModel: "+ Add image model",
    imageModelKeySaved: "Key saved",
    imageModelKeyMissing: "No key",
    imageModelEndpoint: "Endpoint",
    imageModelName: "Image model",
    authMode: "Auth mode",
    responseFormat: "Response format",
    imageModelApiKeyPlaceholder: "Enter API key",
    imageModelSave: "Save image model",
    imageModelSaveChanges: "Save changes",
    authModeHint: "Auth mode hint: most official endpoints use Bearer, while some relay endpoints require Raw.",
    licenseActivated: "Activated / Pro",
    licenseInactive: "License not activated",
  },
};

const ELECTRON_SHELL_STRINGS: Record<AppLanguage, ElectronShellStrings> = {
  "zh-CN": {
    surfaceTextMap: buildShellSurfaceTextMap("zh-CN"),
    defaultSessionTitle: "新对话",
    sessionSectionTitle: "会话",
    noSessions: "暂无会话",
    newSessionTooltip: "新建对话",
    renameSessionTitle: "重命名会话",
    renameSessionDescription: "更新当前会话标题。留空不会保存。",
    renameSessionPlaceholder: "输入新的会话标题",
    exportSessionTitle: "导出当前会话",
    deleteSessionTitle: "删除会话",
    deleteSessionConfirm: "删除这条会话？",
    exportSessionAlertPrefix: "已导出：",
    workspaceSectionTitle: "工作区",
    settingsLabel: "设置",
    emptyStateTitle: "有什么可以帮你的？",
    emptyStateDescription: "输入问题或粘贴代码开始对话",
    composerPlaceholder: "给 KainClaw 发消息... (/ 打开命令)",
    composerBusyPlaceholder: "AI 正在回复...",
    composerBackgroundPlaceholder: "AI 正在后台工作...",
    composerImagePlaceholder: "正在创建图片...",
    composerBusyStatus: "AI 正在回复...",
    composerBackgroundStatus: "AI 正在后台处理任务，结果返回后会自动显示。",
    backgroundTaskBubble: "AI 正在后台处理任务，完成后会自动回流结果。",
    imageModeBadge: "图片生成",
    imageModeCopy: "当前输入将按图片任务处理。你也可以上传参考图一起生成。",
    imageModeCopyWithReferences: "当前输入将按图片任务处理，并附带 {count} 张参考图。",
    imageModeActivate: "生成图片",
    imageModeActive: "图片模式中",
    imageModeExit: "退出图片模式",
    imageModePromptPlaceholder: "描述你想生成的图片...",
    actionGenerateImage: "生成图片",
    actionEditImage: "编辑图片",
    actionPromptLibrary: "提示词库",
    actionReferenceImages: "找参考图",
    providerLabelLoading: "加载中...",
    providerLabelUnset: "未配置",
    workspaceBadgePick: "选择工作区",
    workspaceBadgeTitlePick: "点击选择工作区文件夹",
    workspaceTooltipCurrent: "当前工作区：{path}",
    workspaceTooltipSelected: "已选目录：{path}",
    workspaceTooltipDetail: "说明：{detail}",
    workspaceStatusGitRepo: "Git 仓库",
    workspaceStatusPathMissing: "工作区路径失效",
    workspaceStatusNotGit: "当前目录不是 Git 仓库",
    workspaceStatusAmbiguous: "检测到多个候选仓库",
    workspaceStatusUnset: "未设置工作区",
    workspaceLineCurrent: "当前目录",
    workspaceLineEffective: "当前生效目录",
    workspaceNotSet: "未设置",
    licenseActivatedBadge: "已激活",
    editImageHint: "编辑图片请先在聊天流中的某张结果图上点击“编辑”。",
    toolRunningPrefix: "正在执行：",
    generatedImageEdit: "编辑",
    generatedImageDownload: "下载",
    imagePendingIntroGenerate: "正在创建图片...",
    imagePendingIntroEdit: "正在根据你的编辑要求处理图片...",
    imagePendingBadgeGenerate: "生成",
    imagePendingBadgeEdit: "编辑",
    imagePendingCountUnit: "张",
    imagePendingCreating: "生成中",
    imagePendingPromptFallback: "系统正在整理图片任务并等待结果返回。",
    imagePendingLoaderTitleGenerate: "正在创建图片",
    imagePendingLoaderTitleEdit: "正在编辑图片",
    imagePendingLoaderSubtitle: "多彩流光渲染中，请稍候",
    imagePendingLoaderSubtitleWithModel: "{model} 多彩流光渲染中，请稍候",
  },
  "en-US": {
    surfaceTextMap: buildShellSurfaceTextMap("en-US"),
    defaultSessionTitle: "New chat",
    sessionSectionTitle: "Sessions",
    noSessions: "No sessions yet",
    newSessionTooltip: "New chat",
    renameSessionTitle: "Rename session",
    renameSessionDescription: "Update the current session title. Blank input will not be saved.",
    renameSessionPlaceholder: "Enter a new session title",
    exportSessionTitle: "Export current session",
    deleteSessionTitle: "Delete session",
    deleteSessionConfirm: "Delete this session?",
    exportSessionAlertPrefix: "Exported: ",
    workspaceSectionTitle: "Workspace",
    settingsLabel: "Settings",
    emptyStateTitle: "How can I help?",
    emptyStateDescription: "Ask a question or paste code to start chatting",
    composerPlaceholder: "Message KainClaw... (/ for commands)",
    composerBusyPlaceholder: "AI is replying...",
    composerBackgroundPlaceholder: "AI is working in the background...",
    composerImagePlaceholder: "Creating images...",
    composerBusyStatus: "AI is replying...",
    composerBackgroundStatus: "AI is processing a background task. Results will appear automatically.",
    backgroundTaskBubble: "AI is handling a background task and will return the result automatically.",
    imageModeBadge: "Image generation",
    imageModeCopy: "Your next input will be handled as an image task. You can also upload reference images.",
    imageModeCopyWithReferences: "Your next input will be handled as an image task with {count} reference image(s).",
    imageModeActivate: "Generate image",
    imageModeActive: "Image mode on",
    imageModeExit: "Exit image mode",
    imageModePromptPlaceholder: "Describe the image you want to generate...",
    actionGenerateImage: "Generate image",
    actionEditImage: "Edit image",
    actionPromptLibrary: "Prompt library",
    actionReferenceImages: "Find references",
    providerLabelLoading: "Loading...",
    providerLabelUnset: "Not configured",
    workspaceBadgePick: "Choose workspace",
    workspaceBadgeTitlePick: "Click to choose a workspace folder",
    workspaceTooltipCurrent: "Current workspace: {path}",
    workspaceTooltipSelected: "Selected folder: {path}",
    workspaceTooltipDetail: "Note: {detail}",
    workspaceStatusGitRepo: "Git repository",
    workspaceStatusPathMissing: "Workspace path is missing",
    workspaceStatusNotGit: "The current folder is not a Git repository",
    workspaceStatusAmbiguous: "Multiple candidate repositories detected",
    workspaceStatusUnset: "Workspace not set",
    workspaceLineCurrent: "Current folder",
    workspaceLineEffective: "Effective folder",
    workspaceNotSet: "Not set",
    licenseActivatedBadge: "Activated",
    editImageHint: "To edit an image, first click “Edit” on one of the result images in the chat transcript.",
    toolRunningPrefix: "Running:",
    thinkingSummaryTitle: "Thought summary",
    generatedImageEdit: "Edit",
    generatedImageDownload: "Download",
    imagePendingIntroGenerate: "Creating images...",
    imagePendingIntroEdit: "Applying your image edit request...",
    imagePendingBadgeGenerate: "generate",
    imagePendingBadgeEdit: "edit",
    imagePendingCountUnit: "images",
    imagePendingCreating: "Generating",
    imagePendingPromptFallback: "KainClaw is preparing the image task and waiting for the result.",
    imagePendingLoaderTitleGenerate: "Creating image",
    imagePendingLoaderTitleEdit: "Editing image",
    imagePendingLoaderSubtitle: "Rendering in progress, please wait",
    imagePendingLoaderSubtitleWithModel: "{model} rendering in progress, please wait",
  },
};

export function getElectronSettingsStrings(language?: string): ElectronSettingsStrings {
  return ELECTRON_SETTINGS_STRINGS[normalizeAppLanguage(language)];
}

export function getElectronShellStrings(language?: string): ElectronShellStrings {
  const normalizedLanguage = normalizeAppLanguage(language);
  const strings = ELECTRON_SHELL_STRINGS[normalizedLanguage];

  return {
    ...strings,
    thinkingSummaryTitle:
      typeof strings.thinkingSummaryTitle === "string"
        ? strings.thinkingSummaryTitle
        : normalizedLanguage === "en-US"
          ? "Thought summary"
          : "思考摘要",
  };
}

export function getElectronDebugCommandDescription(language?: string): string {
  return normalizeAppLanguage(language) === "en-US"
    ? "Run Electron-only debug helpers such as AskUserQuestion parity test flows."
    : "运行 Electron 专用调试辅助，例如 AskUserQuestion 对齐测试。";
}

export function buildDebugAskUserQuestionInput(
  language: AppLanguage,
  variant: "single" | "multi",
): Record<string, unknown> {
  if (variant === "multi") {
    if (language === "en-US") {
      return {
        title: "AskUserQuestion Multi-Step Debug",
        questions: [
          {
            header: "Approach",
            question: "How should I continue this parity task?",
            options: [
              {
                label: "Keep current plan",
                description: "Stay on the current implementation path.",
                preview:
                  "Preview:\n- continue renderer parity work\n- avoid widening shared runtime scope",
              },
              {
                label: "Re-scope first",
                description: "Tighten scope before continuing.",
                preview:
                  "Preview:\n- stop after cleanup\n- defer broader product-surface work",
              },
            ],
          },
          {
            header: "Checks",
            question: "Which follow-up checks do you want?",
            multiSelect: true,
            options: [
              {
                label: "Manual Electron test",
                description: "Run the desktop shell manually again.",
              },
              {
                label: "Build/Test",
                description: "Run automated verification.",
              },
              {
                label: "Doc sync",
                description: "Update handoff and parity notes.",
              },
            ],
          },
        ],
      };
    }

    return {
      title: "AskUserQuestion 多题调试",
      questions: [
        {
          header: "方案",
          question: "我应该如何继续这个对齐任务？",
          options: [
            {
              label: "保持当前方案",
              description: "按当前实现路径继续。",
              preview:
                "预览：\n- 继续推进 renderer 对齐工作\n- 避免扩大共享 runtime 范围",
            },
            {
              label: "先收口范围",
              description: "先收紧范围再继续。",
              preview:
                "预览：\n- 先停在当前清理点\n- 推迟更宽的产品面改动",
            },
          ],
        },
        {
          header: "检查项",
          question: "你希望做哪些后续检查？",
          multiSelect: true,
          options: [
            {
              label: "手动测 Electron",
              description: "再手动验证一次桌面壳。",
            },
            {
              label: "构建/测试",
              description: "运行自动化校验。",
            },
            {
              label: "同步文档",
              description: "更新交接与对齐记录。",
            },
          ],
        },
      ],
    };
  }

  if (language === "en-US") {
    return {
      title: "AskUserQuestion Single-Step Debug",
      questions: [
        {
          header: "Freeze Dir",
          question:
            "Which directory should I restrict edits to? Files outside this path will be blocked from editing.",
          options: [
            {
              label: "Current workspace",
              description: "Use the active workspace root.",
              preview: "Preview:\n- writes stay inside the current workspace",
            },
            {
              label: "Parent project",
              description: "Use the parent project directory.",
              preview:
                "Preview:\n- allows edits across sibling folders under the parent project",
            },
          ],
        },
      ],
    };
  }

  return {
    title: "AskUserQuestion 单题调试",
    questions: [
      {
        header: "冻结目录",
        question: "要将编辑限制在哪个目录内？该路径之外的文件将被禁止编辑。",
        options: [
          {
            label: "当前工作区",
            description: "使用当前激活的工作区根目录。",
            preview: "预览：\n- 写入只会发生在当前工作区内",
          },
          {
            label: "上级项目",
            description: "使用上级项目目录。",
            preview: "预览：\n- 允许编辑上级项目目录下的同级文件夹",
          },
        ],
      },
    ],
  };
}

export function buildFreezeQuestionCopy(language: AppLanguage, options: {
  workspaceRoot: string;
  parentRoot: string;
  workspaceLabel: string;
  parentLabel: string;
}): {
  title: string;
  header: string;
  question: string;
  workspaceOption: { label: string; description: string };
  parentOption: { label: string; description: string };
  cancelledMessage: string;
} {
  if (language === "en-US") {
    return {
      title: "Freeze Directory",
      header: "Freeze Dir",
      question:
        "Which directory should I restrict edits to? Files outside this path will be blocked from editing.",
      workspaceOption: {
        label: options.workspaceLabel,
        description: `Current workspace directory: ${options.workspaceRoot}`,
      },
      parentOption: {
        label: options.parentLabel,
        description: `Parent project directory: ${options.parentRoot}`,
      },
      cancelledMessage: "Freeze setup cancelled.",
    };
  }

  return {
    title: "选择冻结目录",
    header: "冻结目录",
    question: "要将编辑限制在哪个目录内？该路径之外的文件将被禁止编辑。",
    workspaceOption: {
      label: options.workspaceLabel,
      description: `当前工作区目录：${options.workspaceRoot}`,
    },
    parentOption: {
      label: options.parentLabel,
      description: `上级项目目录：${options.parentRoot}`,
    },
    cancelledMessage: "已取消冻结目录设置。",
  };
}
