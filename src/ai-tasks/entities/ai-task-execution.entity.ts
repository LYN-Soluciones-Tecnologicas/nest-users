import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AiTask } from './ai-task.entity';

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Stores the result of executing an AI task on a specific tender.
 * Each execution records the prompt sent, the result received, and metadata.
 */
@Entity('ai_task_executions')
@Index(['tenderId', 'taskId'])
@Index(['status'])
export class AiTaskExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenderId: string;

  @Column('uuid')
  taskId: string;

  @ManyToOne(() => AiTask, { eager: true })
  @JoinColumn({ name: 'taskId' })
  task: AiTask;

  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.PENDING,
  })
  status: ExecutionStatus;

  /** The fully rendered prompt that was sent to the LLM */
  @Column({ type: 'text', nullable: true })
  renderedPrompt: string;

  /** The LLM's response */
  @Column({ type: 'text', nullable: true })
  result: string;

  /** Model used for this execution */
  @Column({ nullable: true })
  model: string;

  /** Token usage */
  @Column({ type: 'jsonb', nullable: true })
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Execution time in milliseconds */
  @Column({ nullable: true })
  durationMs: number;

  /** Error message if failed */
  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;
}
