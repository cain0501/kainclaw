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
    notePlaceholder: "给 Claude 的补充说明",
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
    notePlaceholder: "Add context for Claude",
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
