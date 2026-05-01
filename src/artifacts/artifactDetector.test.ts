import { describe, expect, it } from "vitest";
import { canArtifactUseDeepEdit } from "./artifactObject";
import { detectArtifact, unwrapSingleOuterFence } from "./artifactDetector";

describe("artifactDetector", () => {
  it("detects bare HTML documents as html artifacts", () => {
    const artifact = detectArtifact(`<!DOCTYPE html>
<html>
  <head><title>我的原型</title></head>
  <body>Hello</body>
</html>`, {
      id: "artifact-1",
      now: 123,
      sourceMessageId: "message-1",
    });

    expect(artifact).toEqual({
      id: "artifact-1",
      type: "html",
      content: `<!DOCTYPE html>
<html>
  <head><title>我的原型</title></head>
  <body>Hello</body>
</html>`,
      sourceMessageId: "message-1",
      title: "我的原型",
      createdAt: 123,
      metadata: {
        lineCount: 5,
      },
    });
  });

  it("unwraps fenced html before detecting it", () => {
    const artifact = detectArtifact(`\`\`\`html
<!DOCTYPE html>
<html>
  <body>Prototype</body>
</html>
\`\`\``);

    expect(artifact?.type).toBe("html");
    expect(artifact?.title).toBe("HTML 原型");
    expect(artifact?.content).toBe(`<!DOCTYPE html>
<html>
  <body>Prototype</body>
</html>`);
  });

  it("detects fenced html blocks even when wrapped in surrounding prose", () => {
    const artifact = detectArtifact(`当然，下面是原型代码：

\`\`\`html
<!DOCTYPE html>
<html>
  <head><title>Wrapped HTML</title></head>
  <body>Prototype</body>
</html>
\`\`\``);

    expect(artifact?.type).toBe("html");
    expect(artifact?.title).toBe("Wrapped HTML");
  });

  it("detects bare svg content", () => {
    const artifact = detectArtifact(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`);

    expect(artifact?.type).toBe("svg");
    expect(artifact?.title).toBe("SVG 图形");
  });

  it("unwraps fenced svg before detecting it", () => {
    const artifact = detectArtifact(`\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>
\`\`\``);

    expect(artifact?.type).toBe("svg");
    expect(artifact?.content).toBe(`<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>`);
  });

  it("detects fenced svg blocks even when wrapped in surrounding prose", () => {
    const artifact = detectArtifact(`这里是 SVG：

\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"/></svg>
\`\`\``);

    expect(artifact?.type).toBe("svg");
    expect(artifact?.title).toBe("SVG 图形");
  });

  it("unwraps fenced mermaid and strips the fence markers", () => {
    const artifact = detectArtifact(`\`\`\`mermaid
graph TD
  A --> B
\`\`\``);

    expect(artifact?.type).toBe("mermaid");
    expect(artifact?.title).toBe("架构图");
    expect(artifact?.content).toBe(`graph TD
  A --> B`);
  });

  it("detects python code fences and records the language", () => {
    const artifact = detectArtifact(`\`\`\`python
print("hello")
\`\`\``);

    expect(artifact?.type).toBe("code");
    expect(artifact?.title).toBe("Python 代码");
    expect(artifact?.metadata?.language).toBe("python");
  });

  it("detects typescript code fences and records the language", () => {
    const artifact = detectArtifact(`\`\`\`typescript
const answer: number = 42;
\`\`\``);

    expect(artifact?.type).toBe("code");
    expect(artifact?.title).toBe("TypeScript 代码");
    expect(artifact?.metadata?.language).toBe("typescript");
  });

  it("returns null for long plain-text replies without artifact markers", () => {
    const artifact = detectArtifact(`第一行
第二行
第三行
第四行
第五行
第六行
第七行
第八行
第九行
第十行
第十一行
第十二行
第十三行
第十四行
第十五行
第十六行
第十七行
第十八行
第十九行
第二十行
第二十一行`);

    expect(artifact).toBeNull();
  });

  it("returns null for fenced markdown", () => {
    const artifact = detectArtifact(`\`\`\`markdown
# 标题
正文
\`\`\``);

    expect(artifact).toBeNull();
  });

  it("returns null for prompt_rewrite-style plain text", () => {
    const artifact = detectArtifact("根据以上提示词，把你说的归茶这一理念重写一份");

    expect(artifact).toBeNull();
  });

  it("returns null for image URLs", () => {
    const artifact = detectArtifact("https://example.com/image.png");

    expect(artifact).toBeNull();
  });

  it("prioritizes mermaid over other code fences in mixed text", () => {
    const artifact = detectArtifact(`说明：
\`\`\`mermaid
graph TD
  A --> B
\`\`\`

\`\`\`typescript
const answer = 42;
\`\`\``);

    expect(artifact?.type).toBe("mermaid");
    expect(artifact?.content).toBe(`graph TD
  A --> B`);
  });

  it("detects code fences without language and leaves metadata.language undefined", () => {
    const artifact = detectArtifact(`\`\`\`
plain code
\`\`\``);

    expect(artifact?.type).toBe("code");
    expect(artifact?.title).toBe("代码");
    expect(artifact?.metadata?.language).toBeUndefined();
  });

  it("does not unwrap nested fences", () => {
    const unwrapped = unwrapSingleOuterFence(`\`\`\`html
<div>
\`\`\`js
const x = 1;
\`\`\`
</div>
\`\`\``);
    const artifact = detectArtifact(`\`\`\`html
<div>
\`\`\`js
const x = 1;
\`\`\`
</div>
\`\`\``);

    expect(unwrapped).toBeNull();
    expect(artifact?.type).toBe("code");
  });

  it("exports deep-edit visibility rules with html enabled only", () => {
    expect(canArtifactUseDeepEdit("html")).toBe(true);
    expect(canArtifactUseDeepEdit("svg")).toBe(false);
    expect(canArtifactUseDeepEdit("mermaid")).toBe(false);
    expect(canArtifactUseDeepEdit("code")).toBe(false);
    expect(canArtifactUseDeepEdit("markdown")).toBe(false);
  });
});
