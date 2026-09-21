/**
 * EVA Task Status Lifecycle
 * Conforms to Section 31 of EVA Master Orchestration Spec
 */

export type TaskStatusType =
  | 'RECEIVED'
  | 'UNDERSTANDING'
  | 'RESOLVING'
  | 'PLANNING'
  | 'AUTHORIZING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'VERIFYING'
  | 'RECOVERING'
  | 'WAITING_FOR_USER'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface TaskStatusEvent {
  taskId: string;
  previousStatus?: TaskStatusType;
  currentStatus: TaskStatusType;
  timestamp: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type TaskStatusListener = (event: TaskStatusEvent) => void;

export class TaskLifecycleTracker {
  private taskId: string;
  private currentStatus: TaskStatusType = 'RECEIVED';
  private history: TaskStatusEvent[] = [];
  private listeners: Set<TaskStatusListener> = new Set();

  constructor(taskId: string) {
    this.taskId = taskId;
    this.transition('RECEIVED', 'Task received');
  }

  public getTaskId(): string {
    return this.taskId;
  }

  public getStatus(): TaskStatusType {
    return this.currentStatus;
  }

  public getHistory(): TaskStatusEvent[] {
    return [...this.history];
  }

  public transition(nextStatus: TaskStatusType, message?: string, metadata?: Record<string, unknown>): void {
    const previousStatus = this.currentStatus;
    this.currentStatus = nextStatus;

    const event: TaskStatusEvent = {
      taskId: this.taskId,
      previousStatus: this.history.length > 0 ? previousStatus : undefined,
      currentStatus: nextStatus,
      timestamp: Date.now(),
      message,
      metadata,
    };

    this.history.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  public addListener(listener: TaskStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isTerminal(): boolean {
    return (
      this.currentStatus === 'COMPLETED' ||
      this.currentStatus === 'FAILED' ||
      this.currentStatus === 'CANCELLED'
    );
  }
}

