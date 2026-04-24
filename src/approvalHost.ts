import { randomUUID } from "node:crypto";

import {
  getApprovalActivityLabel,
  getApprovalDecisionLabel,
} from "./hostUi";
import type {
  ToolActionApprovalRequest,
  WriteApprovalRequest,
} from "./toolRuntime";

export type PendingApproval =
  | {
      id: string;
      kind: "file";
      title: string;
      summary: string;
      path: string;
      diff: string;
    }
  | {
      id: string;
      kind: "tool";
      title: string;
      summary: string;
      inputPreview: string;
    };

type ActivityStatus = "done" | "error";

export class ApprovalHost {
  private pendingApproval: PendingApproval | undefined;
  private approvalResolver: ((approved: boolean) => void) | undefined;

  constructor(
    private readonly options: {
      showDiff: (
        workspaceRoot: string,
        request: WriteApprovalRequest,
      ) => Promise<void>;
      addActivity: (
        kind: "approval",
        label: string,
        detail: string,
        status: "waiting",
      ) => string;
      finishActivity: (
        activityId: string,
        status: ActivityStatus,
        detail?: string,
      ) => void;
      postState: () => void;
      createId?: () => string;
    },
  ) {}

  hasPendingApproval(): boolean {
    return !!this.pendingApproval;
  }

  getPendingApproval(): PendingApproval | undefined {
    return this.pendingApproval;
  }

  async requestFileApproval(
    workspaceRoot: string,
    request: WriteApprovalRequest,
  ): Promise<boolean> {
    await this.options.showDiff(request.workspaceRoot ?? workspaceRoot, request);
    const activityId = this.options.addActivity(
      "approval",
      getApprovalActivityLabel("file"),
      request.path,
      "waiting",
    );
    const approved = await this.queueApproval({
      id: this.createApprovalId(),
      kind: "file",
      title: request.kind === "write_file" ? "Confirm file write" : "Confirm file update",
      summary: request.summary,
      path: request.path,
      diff: request.diff,
    });
    this.options.finishActivity(
      activityId,
      approved ? "done" : "error",
      getApprovalDecisionLabel(approved),
    );
    return approved;
  }

  async requestToolApproval(request: ToolActionApprovalRequest): Promise<boolean> {
    const activityId = this.options.addActivity(
      "approval",
      getApprovalActivityLabel("tool"),
      request.summary,
      "waiting",
    );
    const approved = await this.queueApproval({
      id: this.createApprovalId(),
      kind: "tool",
      title: request.title || "Confirm external action",
      summary: request.summary,
      inputPreview: request.inputPreview,
    });
    this.options.finishActivity(
      activityId,
      approved ? "done" : "error",
      getApprovalDecisionLabel(approved),
    );
    return approved;
  }

  resolvePendingApproval(approved: boolean): void {
    const resolver = this.approvalResolver;
    this.pendingApproval = undefined;
    this.approvalResolver = undefined;
    this.options.postState();
    resolver?.(approved);
  }

  private async queueApproval(approval: PendingApproval): Promise<boolean> {
    if (this.pendingApproval) {
      throw new Error("Another confirmation is already pending.");
    }

    this.pendingApproval = approval;
    this.options.postState();
    return new Promise<boolean>(resolve => {
      this.approvalResolver = resolve;
    });
  }

  private createApprovalId(): string {
    return this.options.createId?.() ?? randomUUID();
  }
}
