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
  workspaceStatusWorktree: string;
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
  ["最小化", "Minimize"],
  ["最大化", "Maximize"],
  ["关闭", "Close"],
  ["保存", "Save"],
  ["使用", "Use"],
  ["删除", "Delete"],
  ["我的", "Mine"],
  ["内置", "Built-in"],
  ["收藏", "Favorite"],
  ["取消收藏", "Remove favorite"],
  ["删除提示词", "Delete prompt"],
  ["删除提供商", "Delete provider"],
  ["删除这个提供商？", "Delete this provider?"],
  ["请填写别名", "Enter an alias"],
  ["请输入 License Key", "Enter a license key"],
  ["确定要重置所有配置吗？\n\n这会清除 Provider 配置并重新进入配置向导，会话记录不会受影响。", "Reset all configuration?\n\nThis clears provider configuration and reopens onboarding. Session history will not be removed."],
  ["进入 KainClaw Design", "Open in KainClaw Design"],
  ["当前无法打开 KainClaw Design。", "Unable to open KainClaw Design right now."],
  ["图片任务失败", "Image task failed"],
  ["已停止当前图片生成。", "Stopped the current image generation."],
  ["正在停止当前图片生成...", "Stopping the current image generation..."],
  ["请先加入至少一张参考图，再做提示词反推。", "Add at least one reference image before inferring a prompt."],
  ["正在根据参考图反推提示词...", "Inferring a prompt from the reference images..."],
  ["请先输入需求，或至少准备一张参考图，再执行工作流编排。", "Enter a request or prepare at least one reference image before orchestrating the workflow."],
  ["正在用聊天模型编排图像工作流...", "Orchestrating the image workflow with the chat model..."],
  ["已清空本次工作流编排结果。", "Cleared the current workflow plan."],
  ["图像模型尚未配置，请先前往设置页完成配置。", "The image model is not configured yet. Open Settings and finish the setup first."],
  ["请输入 prompt。", "Enter a prompt."],
  ["正在根据参考图组编辑...", "Editing from the reference image set..."],
  ["正在生成图片...", "Generating images..."],
  ["当前图像模型尚未配置完成，请先前往设置页处理。", "The current image model is not fully configured. Open Settings to finish it first."],
  ["还没有可重生成的图片请求。", "There is no image request to rerun yet."],
  ["正在重生成...", "Rerunning image generation..."],
  ["正在生成变体...", "Generating a variant..."],
  ["未找到要继续编辑的图片。", "No image was found to continue editing."],
  ["已把这张结果图加入参考图组前列。现在可继续追加元素参考图，再点击“生成 / 编辑”做二次改图。", "Moved this result to the front of the reference set. You can add more element references and click “Generate / Edit” again."],
  ["标题、分类和提示词内容不能为空。", "Title, category, and prompt content are required."],
  ["已更新提示词。", "Updated the prompt."],
  ["已保存到提示词库。", "Saved to the prompt library."],
  ["已根据参考图反推出提示词。", "Inferred a prompt from the reference images."],
  ["已完成图像工作流编排，并回填最终执行提示词。", "Completed image workflow orchestration and filled in the final execution prompt."],
  ["已完成双语提示词反推。中文在前，英文在后。", "Completed bilingual prompt inference. Chinese is shown first and English second."],
  ["参考图组最多保留 4 张。请先移除一张再继续添加。", "You can keep up to 4 reference images. Remove one before adding more."],
  ["已清空参考图组，接下来会回到纯生成模式。", "Cleared the reference set. The next run will switch back to pure generation mode."],
  ["已把搜索到的素材图加入当前图片任务。", "Added the fetched material image to the current image task."],
  ["正在请求图像服务并等待图片返回。彩色流光占位会在真实图片到达后自动替换。", "Requesting the image service and waiting for the images to return. The colorful placeholders will be replaced automatically when the real images arrive."],
  ["已加入参考图组，可直接继续生成 / 编辑。", "Added to the reference set. You can continue generating or editing now."],
  ["这条提示词还没有样本图可设为参考图。", "This prompt does not have a sample image to use as a reference yet."],
  ["已把双语反推提示词保存到提示词库。", "Saved the bilingual inferred prompt to the prompt library."],
  ["已将英文提示词插入工作台。", "Inserted the English prompt into the workspace."],
  ["已将中文提示词插入工作台。", "Inserted the Chinese prompt into the workspace."],
  ["请输入 prompt。", "Prompt is required."],
  ["请先提供至少一张参考图，再执行提示词反推。", "Provide at least one reference image before inferring a prompt."],
  ["当前聊天模型不支持图片理解。请先切换到支持视觉输入的聊天模型。", "The current chat model does not support image understanding. Switch to a model with vision input first."],
  ["请先上传一张图片，再执行提示词反推。", "Upload an image before inferring a prompt."],
  ["请输入图像需求，或至少提供一张参考图，再执行工作流编排。", "Enter an image request or provide at least one reference image before orchestrating the workflow."],
  ["当前聊天模型不支持带参考图的工作流编排。请先切换到支持视觉输入的聊天模型。", "The current chat model does not support workflow orchestration with reference images. Switch to a model with vision input first."],
  ["当前聊天模型不支持带参考图的资料查找编排。请先切换到支持视觉输入的聊天模型。", "The current chat model does not support material-search orchestration with reference images. Switch to a model with vision input first."],
  ["请输入想补充的素材方向，或至少提供一张目标图，再查找资料。", "Describe the material direction you want to add, or provide a target image before searching for references."],
  ["当前还没有会话内容可供带入 KainClaw Design。", "There is no session content to send to KainClaw Design yet."],
  ["请先选中一个 HTML Artifact，再进入 KainClaw Design。", "Select an HTML artifact before opening KainClaw Design."],
  ["请先上传一张设计图，或先生成一张图片，再让我把它做成可点击的 HTML 原型。", "Upload a design image, or generate one first, then I can turn it into a clickable HTML prototype."],
  ["当前聊天模型不支持图片理解。请先切换到支持视觉输入的聊天模型，再把设计图转换成 HTML 原型。", "The current chat model does not support image understanding. Switch to a model with vision input before converting the design image into an HTML prototype."],
  ["删除这张结果", "Delete this result"],
  ["留空则保留当前 Key", "Leave blank to keep the current key"],
  ["当前没有活动的图像模型。请先打开设置并选择一个。", "No active image model is configured. Open Settings and choose one first."],
  ["当前活动图像模型还没有 API Key。请先打开设置并保存。", "The active image model does not have an API key yet. Open Settings and save one first."],
  ["当前活动图像模型配置不完整。请先打开设置并补全 base URL 和 model 字段。", "The active image model is incomplete. Open Settings and finish the base URL and model fields."],
  ["图像", "Images"],
  ["设计", "Design"],
  ["作品库", "Library"],
  ["设计作品工作台", "Design workbench"],
  ["图像生成与素材管理", "Image generation and asset management"],
  ["主对象：图片素材", "Primary object: image assets"],
  ["作品库 / 素材库", "Works / asset library"],
  ["全量浏览与搜索", "Browse and search everything"],
  ["最近作品", "Recent works"],
  ["只显示正式作品，快速切换当前设计上下文。", "Only formal works are shown. Quickly switch the current design context."],
  ["+ 新建作品", "+ New work"],
  ["查看全部作品", "View all works"],
  ["当前作品工作台", "Current workbench"],
  ["左侧只切换作品；右侧承载设计对话、画布预览和版本记录。", "Use the left side to switch works. The right side contains design chat, canvas preview, and version history."],
  ["提示词库", "Prompt library"],
  ["当前作品", "Current work"],
  ["当前目标", "Current target"],
  ["未选择作品", "No work selected"],
  ["（无作品）", "(No work)"],
  ["当前设计", "Current design"],
  ["当前元素", "Current element"],
  ["图片素材", "Image assets"],
  ["作品", "Work"],
  ["草稿", "Draft"],
  ["未命名作品", "Untitled work"],
  ["未生成", "Not generated"],
  ["临时工作态", "Temporary state"],
  ["不会写入作品库；生成第一版后才升级为正式作品。", "This is not written to the library. Generate the first version to convert it into a formal work."],
  ["还没有正式设计作品。生成第一版后，它会出现在这里。", "No formal design works yet. They will appear here after the first version is generated."],
  ["新作品 · 草稿", "New work - Draft"],
  ["新作品 · 未命名", "New work - Untitled"],
  ["设计对话", "Design chat"],
  ["画布预览", "Canvas preview"],
  ["版本记录", "Version history"],
  ["你想怎么开始？", "How do you want to start?"],
  ["✦ 快速生成一稿", "Quickly generate a first draft"],
  ["回答 3 个问题，AI 直接出稿", "Answer 3 questions and let AI generate directly"],
  ["✦ 先聊需求，再生成", "Discuss requirements before generating"],
  ["AI 引导你确认细节，再生成", "AI helps confirm details before generating"],
  ["视觉方向 / 品牌参考", "Visual direction / Brand reference"],
  ["视觉方向", "Visual direction"],
  ["品牌参考", "Brand reference"],
  ["（可不选）", "(optional)"],
  ["视觉方向（可选）", "Visual direction (optional)"],
  ["品牌参考（可选）", "Brand reference (optional)"],
  ["参考图（可选）", "Reference images (optional)"],
  ["+ 上传参考图", "+ Upload reference image"],
  ["引导填写", "Guided setup"],
  ["生成设计", "Generate design"],
  ["从这个作品专属的设计对话开始", "Start from this work's dedicated design chat"],
  ["描述需求、补充方向、接收引导问题；生成第一版后再进入画布继续改。", "Describe the request, refine direction, and answer guided questions. After the first version is generated, continue editing on the canvas."],
  ["快速生成 · 6 个问题", "Quick generate - 6 questions"],
  ["带 * 必填；其他可不填，AI 自行判断", "Fields marked * are required. Leave the rest blank and the AI will decide."],
  ["作品想做什么 *", "What should this work do? *"],
  ["如：小米18官网首页，科技感强，需要展示产品亮点和购买入口", "Example: a tech-forward homepage for Xiaomi 18 that highlights product benefits and purchase entry points"],
  ["输出类型 *", "Output type *"],
  ["主要给谁看（可选）", "Primary audience (optional)"],
  ["如：消费者、投资人、内部团队…", "Example: consumers, investors, internal teams..."],
  ["继续描述这个作品想做什么、想保留什么，或让系统针对当前版本继续迭代。", "Describe what this work should do, what to keep, or how the system should iterate on the current version."],
  ["描述这个作品想做什么…", "Describe what this work should do..."],
  ["按 Enter 发送，Shift + Enter 换行", "Press Enter to send, Shift + Enter for a new line"],
  ["新建作品后，先在这里描述需求，再开始生成第一版。", "After creating a work, describe the request here before generating the first version."],
  ["看画布", "View canvas"],
  ["描述这个作品想做什么...", "Describe what this work should do..."],
  ["继续描述这个作品具体想做什么、想保留什么，或让系统针对当前版本继续迭代。", "Describe what this work should do, what to keep, or how the system should iterate on the current version."],
  ["通常需要 10~30 秒", "Usually takes 10-30 seconds"],
  ["生成", "Generate"],
  ["编辑", "Edit"],
  ["变体", "Variant"],
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
    workspaceStatusWorktree: "Worktree 会话",
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
    workspaceStatusWorktree: "Worktree session",
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
