import { EventEmitter } from "node:events";

/**
 * In-process message bus for Swarm coordination (Spec §P04 core mechanism).
 *
 * All agents run inside the same Node.js process in the current VS Code host,
 * so point-to-point and broadcast delivery can be implemented with EventEmitter
 * plus per-agent inbox queues instead of a network or filesystem mailbox.
 *
 * Messages are processed on the receiver's next loop; send_message is an async enqueue,
 * not an immediate interrupt.
 */

export type BusMessage = {
  from: string;
  to: string; // worker id / "coordinator" / "*"
  content: string;
  timestamp: number;
};

export class SwarmBus extends EventEmitter {
  private readonly inboxes = new Map<string, BusMessage[]>();

  /** Register an inbox for an agent id. */
  register(agentId: string): void {
    if (!this.inboxes.has(agentId)) {
      this.inboxes.set(agentId, []);
    }
  }

  /** Unregister an inbox when an agent finishes. */
  unregister(agentId: string): void {
    this.inboxes.delete(agentId);
  }

  /**
   * Send a message.
   * - `to="*"` broadcasts to all registered agents except the sender
   * - anything else is treated as a direct message
   */
  send(msg: BusMessage): void {
    if (msg.to === "*") {
      for (const [id, inbox] of this.inboxes) {
        if (id !== msg.from) {
          inbox.push(msg);
          this.emit("message", id, msg);
        }
      }
    } else {
      const inbox = this.inboxes.get(msg.to);
      if (inbox) {
        inbox.push(msg);
        this.emit("message", msg.to, msg);
      }
      // Silently drop messages to missing targets; the worker may already be gone.
    }
  }

  /** Drain and clear one agent's inbox. */
  drain(agentId: string): BusMessage[] {
    const inbox = this.inboxes.get(agentId);
    if (!inbox || inbox.length === 0) {
      return [];
    }
    return inbox.splice(0);
  }

  /** Return the currently registered agent ids. */
  registeredIds(): string[] {
    return [...this.inboxes.keys()];
  }
}
