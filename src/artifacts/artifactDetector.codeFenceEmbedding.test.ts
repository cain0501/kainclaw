import { describe, expect, it } from "vitest";
import { detectArtifact } from "./artifactDetector";

describe("artifactDetector embedded code fences", () => {
  it("returns null for fenced code blocks embedded inside a normal answer", () => {
    const artifact = detectArtifact(`先执行下面命令：

\`\`\`bash
git clone https://github.com/cain0501/kainclaw.git
cd kainclaw
npm install
\`\`\`

再继续看日志输出。`);

    expect(artifact).toBeNull();
  });
});
