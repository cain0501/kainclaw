import { describe, expect, it } from "vitest";

import { getElectronShellStrings } from "./electronUiLanguage";

describe("electronUiLanguage shell surface map", () => {
  it("maps desktop shell chrome and settings prompts for en-US", () => {
    const map = getElectronShellStrings("en-US").surfaceTextMap;

    expect(map["最小化"]).toBe("Minimize");
    expect(map["进入 KainClaw Design"]).toBe("Open in KainClaw Design");
    expect(map["请填写别名"]).toBe("Enter an alias");
    expect(map["删除这张结果"]).toBe("Delete this result");
    expect(map["留空则保留当前 Key"]).toBe("Leave blank to keep the current key");
    expect(map["GitHub 仓库"]).toBe("GitHub repository");
    expect(map["安装并信任"]).toBe("Install and trust");
  });

  it("supports reverse lookup for host-side English image errors in zh-CN", () => {
    const map = getElectronShellStrings("zh-CN").surfaceTextMap;

    expect(map["Prompt is required."]).toBe("请输入 prompt。");
    expect(map["No active image model is configured. Open Settings and choose one first."]).toBe(
      "当前没有活动的图像模型。请先打开设置并选择一个。",
    );
    expect(
      map["The active image model does not have an API key yet. Open Settings and save one first."],
    ).toBe("当前活动图像模型还没有 API Key。请先打开设置并保存。");
    expect(
      map["The active image model is incomplete. Open Settings and finish the base URL and model fields."],
    ).toBe("当前活动图像模型配置不完整。请先打开设置并补全 base URL 和 model 字段。");
    expect(map["Install and trust"]).toBe("安装并信任");
  });
});
