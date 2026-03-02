import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stores vector embeddings for tenders.
 * Uses pgvector extension for similarity search.
 *
 * Note: The 'embedding' column uses pgvector's vector type.
 * Run: CREATE EXTENSION IF NOT EXISTS vector;
 * before using this entity.
 */
@Entity('tender_embeddings')
@Index(['tenderId'], { unique: true })
export class TenderEmbedding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenderId: string;

  /** The text that was embedded */
  @Column({ type: 'text' })
  embeddedText: string;

  /** Source of the text (title, description, document) */
  @Column({ default: 'combined' })
  textSource: string;

  /**
   * Vector embedding stored as float array.
   * In production with pgvector, use: @Column({ type: 'vector', length: 384 })
   * For now we store as JSON array for compatibility without pgvector extension.
   */
  @Column({ type: 'jsonb', nullable: true })
  embedding: number[];

  /** Embedding model used */
  @Column({ default: 'multilingual-e5-base' })
  model: string;

  /** Dimension of the embedding vector */
  @Column({ default: 384 })
  dimension: number;

  @CreateDateColumn()
  createdAt: Date;
}
