import { describe, expect, it } from "vitest";
import type { ArtifactObject } from "./artifactObject";
import { InMemoryArtifactRegistry } from "./artifactRegistry";

function createArtifact(id: string): ArtifactObject {
  return {
    id,
    type: "html",
    content: `<html><body>${id}</body></html>`,
    title: `artifact-${id}`,
    createdAt: Number(id.replace(/\D/g, "")) || 0,
    metadata: {
      lineCount: 1,
    },
  };
}

describe("InMemoryArtifactRegistry", () => {
  it("activates the newest artifact when pushed", () => {
    const registry = new InMemoryArtifactRegistry();
    const artifact = createArtifact("artifact-1");

    registry.push(artifact);

    expect(registry.artifacts).toEqual([artifact]);
    expect(registry.activeArtifactId).toBe("artifact-1");
    expect(registry.activeArtifact).toEqual(artifact);
  });

  it("keeps older artifacts while activating the latest push", () => {
    const registry = new InMemoryArtifactRegistry();
    const firstArtifact = createArtifact("artifact-1");
    const secondArtifact = createArtifact("artifact-2");

    registry.push(firstArtifact);
    registry.push(secondArtifact);

    expect(registry.artifacts).toEqual([firstArtifact, secondArtifact]);
    expect(registry.activeArtifactId).toBe("artifact-2");
  });

  it("switches the active artifact when setActive targets a known id", () => {
    const registry = new InMemoryArtifactRegistry();
    registry.push(createArtifact("artifact-1"));
    registry.push(createArtifact("artifact-2"));

    const changed = registry.setActive("artifact-1");

    expect(changed).toBe(true);
    expect(registry.activeArtifactId).toBe("artifact-1");
  });

  it("returns false when setActive targets an unknown id", () => {
    const registry = new InMemoryArtifactRegistry();
    registry.push(createArtifact("artifact-1"));

    const changed = registry.setActive("artifact-404");

    expect(changed).toBe(false);
    expect(registry.activeArtifactId).toBe("artifact-1");
  });

  it("dismisses the panel without removing artifacts", () => {
    const registry = new InMemoryArtifactRegistry();
    const artifact = createArtifact("artifact-1");
    registry.push(artifact);

    registry.dismiss();

    expect(registry.activeArtifactId).toBeNull();
    expect(registry.activeArtifact).toBeNull();
    expect(registry.artifacts).toEqual([artifact]);
  });

  it("clears all artifacts and the active selection", () => {
    const registry = new InMemoryArtifactRegistry();
    registry.push(createArtifact("artifact-1"));
    registry.push(createArtifact("artifact-2"));

    registry.clear();

    expect(registry.artifacts).toEqual([]);
    expect(registry.activeArtifactId).toBeNull();
  });
});
