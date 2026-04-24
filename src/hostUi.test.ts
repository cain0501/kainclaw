import { describe, expect, it } from "vitest";
import {
  getApprovalActivityLabel,
  getApprovalDecisionLabel,
  getFailureActivityLabel,
  getQuickActionPrompt,
  getQuickActionUnavailableMessage,
  getToolRunningLabel,
} from "./hostUi";

describe("hostUi helpers", () => {
  it("returns approval activity labels", () => {
    expect(getApprovalActivityLabel("file")).toBe("等待你确认文件改动");
    expect(getApprovalActivityLabel("tool")).toBe("等待你确认外部动作");
  });

  it("returns approval decision labels", () => {
    expect(getApprovalDecisionLabel(true)).toBe("已批准");
    expect(getApprovalDecisionLabel(false)).toBe("已拒绝");
  });

  it("builds quick action prompts and unavailable messages", () => {
    expect(getQuickActionPrompt("readActiveFile", "src/index.ts")).toContain("src/index.ts");
    expect(getQuickActionPrompt("browserSmoke")).toContain("https://example.com");
    expect(getQuickActionPrompt("readActiveFile")).toBeUndefined();
    expect(getQuickActionUnavailableMessage()).toContain("先打开一个工作区内的文件");
  });

  it("builds activity labels", () => {
    expect(getToolRunningLabel("read_file")).toBe("正在执行 read_file");
    expect(getFailureActivityLabel()).toBe("本轮处理失败");
  });
});
