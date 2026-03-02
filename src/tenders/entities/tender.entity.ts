import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DataSourceEntity } from '../../sources/entities/data-source.entity';

export enum TenderStatus {
  PUBLISHED = 'published',
  OPEN = 'open',
  CLOSED = 'closed',
  AWARDED = 'awarded',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

export enum ContractType {
  SERVICES = 'services',
  WORKS = 'works',
  SUPPLIES = 'supplies',
  MIXED = 'mixed',
  OTHER = 'other',
}

@Entity('tenders')
@Index(['sourceId', 'externalId'], { unique: true })
@Index(['status'])
@Index(['publicationDate'])
@Index(['submissionDeadline'])
export class Tender {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** External ID from the data source */
  @Column()
  externalId: string;

  /** Reference to the data source */
  @Column()
  sourceId: string;

  @ManyToOne(() => DataSourceEntity, { eager: false })
  @JoinColumn({ name: 'sourceId', referencedColumnName: 'id' })
  source: DataSourceEntity;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  contractingAuthority: string;

  @Column('text', { array: true, default: '{}' })
  cpvCodes: string[];

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  budgetAmount: number;

  @Column({ default: 'EUR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: TenderStatus,
    default: TenderStatus.UNKNOWN,
  })
  status: TenderStatus;

  @Column({
    type: 'enum',
    enum: ContractType,
    default: ContractType.OTHER,
  })
  contractType: ContractType;

  @Column({ nullable: true })
  procedureType: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'timestamp', nullable: true })
  submissionDeadline: Date;

  @Column({ type: 'timestamp', nullable: true })
  publicationDate: Date;

  @Column({ nullable: true })
  detailUrl: string;

  @Column('text', { array: true, default: '{}' })
  documentUrls: string[];

  @Column({ default: false })
  isMinorContract: boolean;

  /** Company relevance score (0-1), computed by matching engine */
  @Column({ type: 'float', nullable: true })
  relevanceScore: number;

  /** Whether this tender has been saved to a board */
  @Column({ default: false })
  isSaved: boolean;

  /** Whether it was dismissed/rejected by the user */
  @Column({ default: false })
  isDismissed: boolean;

  /** Embedding vector for similarity search (stored as float array, queried via pgvector) */
  @Column({ type: 'text', nullable: true })
  embeddingText: string;

  /** Raw data from the source for reference */
  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
