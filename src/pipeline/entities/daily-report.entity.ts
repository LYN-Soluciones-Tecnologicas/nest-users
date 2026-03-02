import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Stores the result of a daily pipeline execution.
 * Each report captures the full funnel: detected → filtered → prioritized → top picks.
 */
@Entity('daily_reports')
export class DailyReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Date this report covers */
  @Column({ type: 'date' })
  reportDate: string;

  // --- Step 1: Initial detection ---

  /** Total new tenders detected from all sources */
  @Column({ default: 0 })
  totalDetected: number;

  // --- Step 2: Strategic fit filter ---

  /** Tenders remaining after deterministic + vectorial filtering */
  @Column({ default: 0 })
  afterStrategicFilter: number;

  // --- Step 3: Prioritization ---

  /** Tenders remaining after AI-powered prioritization */
  @Column({ default: 0 })
  afterPrioritization: number;

  /** Top tender IDs with their scores */
  @Column({ type: 'jsonb', default: [] })
  topOpportunities: {
    tenderId: string;
    title: string;
    score: number;
    reason: string;
    budgetAmount?: number;
    submissionDeadline?: string;
  }[];

  // --- Step 4: Summary ---

  /** Generated daily summary text (markdown) */
  @Column({ type: 'text', nullable: true })
  summary: string;

  // --- Metadata ---

  /** IDs of tenders that passed all filters */
  @Column({ type: 'jsonb', default: [] })
  filteredTenderIds: string[];

  /** Pipeline execution time in ms */
  @Column({ nullable: true })
  durationMs: number;

  /** Errors during pipeline execution */
  @Column({ type: 'jsonb', default: [] })
  errors: string[];

  /** Status of the pipeline run */
  @Column({ default: 'completed' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
