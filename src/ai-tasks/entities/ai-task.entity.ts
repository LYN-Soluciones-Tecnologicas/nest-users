import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';
import { AiTaskGroup } from './ai-task-group.entity';

/**
 * An AI task template that can be executed on a tender.
 *
 * Each task has a prompt template that the LLM processes with tender data.
 * Tasks are reusable and can be grouped.
 *
 * Available template variables:
 * - {{tenderTitle}} - Tender title
 * - {{tenderDescription}} - Tender description
 * - {{contractingAuthority}} - Who published the tender
 * - {{budgetAmount}} - Budget amount
 * - {{cpvCodes}} - CPV codes
 * - {{contractType}} - Type of contract
 * - {{procedureType}} - Procedure type
 * - {{submissionDeadline}} - Submission deadline
 * - {{detailUrl}} - URL to full tender details
 * - {{documentUrls}} - Related document URLs
 * - {{rawData}} - Full raw JSON data from source
 *
 * Examples:
 * - "Resumen ejecutivo": Summarize the tender in 3-5 sentences
 * - "Criterios de adjudicación": Extract award criteria and weights
 * - "Solvencia técnica": Extract technical solvency requirements
 * - "Propuesta técnica inicial": Draft a preliminary technical proposal
 */
@Entity('ai_tasks')
export class AiTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * System prompt that sets the LLM's role for this task.
   */
  @Column({ type: 'text', nullable: true })
  systemPrompt: string;

  /**
   * The main prompt template. Uses {{variable}} syntax for tender data.
   */
  @Column({ type: 'text' })
  promptTemplate: string;

  /**
   * Optional: model override for this task.
   * Allows using a more powerful model for complex tasks (proposals)
   * and a cheaper model for simple tasks (summaries).
   */
  @Column({ nullable: true })
  modelOverride: string;

  /** Max tokens for the response */
  @Column({ default: 2000 })
  maxTokens: number;

  /** Temperature for generation */
  @Column({ type: 'float', default: 0.3 })
  temperature: number;

  /** Order/priority within a group (lower = first) */
  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => AiTaskGroup, (group) => group.tasks)
  groups: AiTaskGroup[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
