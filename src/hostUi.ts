export function getApprovalActivityLabel(kind: "file" | "tool"): string {
  return kind === "file" ? "等待你确认文件改动" : "等待你确认外部动作";
}

export function getApprovalDecisionLabel(approved: boolean): string {
  return approved ? "已批准" : "已拒绝";
}

export function getQuickActionPrompt(
  action: string,
  activeFilePath?: string,
): string | undefined {
  switch (action) {
    case "readActiveFile":
      return activeFilePath
        ? `读取 ${activeFilePath}，然后告诉我这个文件的作用和启动流程。`
        : undefined;
    case "explainActiveFile":
      return activeFilePath
        ? `读取 ${activeFilePath}，然后说明这个文件的结构、关键函数、输入输出和潜在风险。`
        : undefined;
    case "browserSmoke":
      return "打开 https://example.com，截图并总结页面。";
    case "githubStatus":
      return "看看 GitHub MCP 是否已经连上，并列出我目前最常用的 GitHub 工具。";
    case "supabaseStatus":
      return "看看 Supabase MCP 是否已经连上，并列出当前项目可用的数据库和 Edge Function 工具。";
    default:
      return undefined;
  }
}

export function getQuickActionUnavailableMessage(): string {
  return "先打开一个工作区内的文件，再使用这个快捷动作。";
}

export function getToolRunningLabel(toolName: string): string {
  return `正在执行 ${toolName}`;
}

export function getFailureActivityLabel(): string {
  return "本轮处理失败";
}
