import type { ArtifactObject } from "./artifactObject";

export interface ArtifactRegistry {
  artifacts: ArtifactObject[];
  activeArtifactId: string | null;
  readonly activeArtifact: ArtifactObject | null;
}

export class InMemoryArtifactRegistry implements ArtifactRegistry {
  artifacts: ArtifactObject[] = [];
  activeArtifactId: string | null = null;

  get activeArtifact(): ArtifactObject | null {
    if (!this.activeArtifactId) {
      return null;
    }

    return this.artifacts.find(artifact => artifact.id === this.activeArtifactId) ?? null;
  }

  push(artifact: ArtifactObject): void {
    this.artifacts = [...this.artifacts, artifact];
    this.activeArtifactId = artifact.id;
  }

  setActive(id: string): boolean {
    if (!this.artifacts.some(artifact => artifact.id === id)) {
      return false;
    }

    this.activeArtifactId = id;
    return true;
  }

  dismiss(): void {
    this.activeArtifactId = null;
  }

  clear(): void {
    this.artifacts = [];
    this.activeArtifactId = null;
  }
}
