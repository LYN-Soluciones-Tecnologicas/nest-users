import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A search profile defines what the company is looking for (and what to avoid)
 * using natural language prompts that get vectorized for semantic matching.
 *
 * Example:
 * - inclusionPrompt: "desarrollo de software, páginas web, aplicaciones móviles,
 *   inteligencia artificial, chatbots, WordPress, Drupal, diseño UX/UI"
 * - exclusionPrompt: "ENS alto, ENS medio, ISO 27001, ISO 9001, certificación
 *   de calidad, obras de construcción, suministro de hardware"
 */
@Entity('search_profiles')
export class SearchProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * Natural language description of what to INCLUDE in results.
   * This text gets vectorized and compared semantically against tender embeddings.
   */
  @Column({ type: 'text' })
  inclusionPrompt: string;

  /**
   * Natural language description of what to EXCLUDE from results.
   * Tenders semantically close to this text get penalized.
   */
  @Column({ type: 'text', nullable: true })
  exclusionPrompt: string;

  /**
   * Cached embedding vector for inclusionPrompt.
   * Regenerated when the prompt changes.
   */
  @Column({ type: 'jsonb', nullable: true })
  inclusionEmbedding: number[];

  /**
   * Cached embedding vector for exclusionPrompt.
   * Regenerated when the prompt changes.
   */
  @Column({ type: 'jsonb', nullable: true })
  exclusionEmbedding: number[];

  /**
   * Minimum inclusion similarity score (0-1) for a tender to be considered relevant.
   * Default: 0.5
   */
  @Column({ type: 'float', default: 0.5 })
  inclusionThreshold: number;

  /**
   * Maximum exclusion similarity score (0-1) before a tender gets filtered out.
   * If a tender is too similar to the exclusion prompt, it's rejected.
   * Default: 0.6
   */
  @Column({ type: 'float', default: 0.6 })
  exclusionThreshold: number;

  /**
   * Weight of inclusion similarity in final score (0-1).
   * Default: 0.7
   */
  @Column({ type: 'float', default: 0.7 })
  inclusionWeight: number;

  /**
   * Weight of exclusion penalty in final score (0-1).
   * Default: 0.3
   */
  @Column({ type: 'float', default: 0.3 })
  exclusionWeight: number;

  /**
   * Optional: Use LLM for deeper analysis on top-N vectorial results.
   * This re-ranks tenders by asking the LLM to evaluate relevance.
   * Much more accurate but slower and costs tokens.
   */
  @Column({ default: false })
  useLlmReranking: boolean;

  /**
   * LLM re-ranking prompt template. Available variables:
   * {{tenderTitle}}, {{tenderDescription}}, {{inclusionCriteria}}, {{exclusionCriteria}}
   */
  @Column({ type: 'text', nullable: true })
  llmRerankingPrompt: string;

  /** Number of vectorial results to send to LLM for re-ranking */
  @Column({ default: 50 })
  llmRerankingTopN: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
