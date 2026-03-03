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
import {
  OcdsTenderStatus,
  OcdsProcurementMethod,
  OcdsProcurementCategory,
  OcdsValue,
  OcdsPeriod,
  OcdsItem,
  OcdsDocument,
  OcdsOrganization,
  OcdsOrganizationReference,
  OcdsMilestone,
  OcdsAmendment,
} from '../../common/ocds';

// ─── Legacy enums (kept for backward compatibility) ───────────────────────────

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
@Index(['ocdsStatus'])
@Index(['procurementMethod'])
@Index(['mainProcurementCategory'])
@Index(['ocid'], { unique: true, where: '"ocid" IS NOT NULL' })
export class Tender {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── OCDS Identifier ─────────────────────────────────────────────────

  /** Open Contracting ID — globally unique across all sources */
  @Column({ nullable: true, unique: true })
  ocid: string;

  /** External ID from the data source */
  @Column()
  externalId: string;

  /** Reference to the data source */
  @Column()
  sourceId: string;

  @ManyToOne(() => DataSourceEntity, { eager: false })
  @JoinColumn({ name: 'sourceId', referencedColumnName: 'id' })
  source: DataSourceEntity;

  // ─── Core fields (compatible with both legacy and OCDS) ──────────────

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

  // ─── Legacy status/type (kept for backward compat) ───────────────────

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

  // ─── OCDS Status & Method ────────────────────────────────────────────

  /** OCDS tender status codelist */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  ocdsStatus: OcdsTenderStatus;

  /** OCDS procurement method (open, selective, limited, direct) */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  procurementMethod: OcdsProcurementMethod;

  /** Free-text description of the procurement method */
  @Column({ nullable: true })
  procurementMethodDetails: string;

  /** OCDS main procurement category (goods, works, services) */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  mainProcurementCategory: OcdsProcurementCategory;

  // ─── OCDS Structured fields (JSONB) ──────────────────────────────────

  /** OCDS Value: { amount, currency } */
  @Column({ type: 'jsonb', nullable: true })
  value: OcdsValue;

  /** OCDS tender period: { startDate, endDate } */
  @Column({ type: 'jsonb', nullable: true })
  tenderPeriod: OcdsPeriod;

  /** OCDS items with CPV classification */
  @Column({ type: 'jsonb', default: '[]' })
  items: OcdsItem[];

  /** OCDS procuring entity reference */
  @Column({ type: 'jsonb', nullable: true })
  procuringEntity: OcdsOrganizationReference;

  /** OCDS parties / organizations involved */
  @Column({ type: 'jsonb', default: '[]' })
  parties: OcdsOrganization[];

  /** OCDS structured documents */
  @Column({ type: 'jsonb', default: '[]' })
  documents: OcdsDocument[];

  /** OCDS milestones */
  @Column({ type: 'jsonb', default: '[]' })
  milestones: OcdsMilestone[];

  /** OCDS amendments */
  @Column({ type: 'jsonb', default: '[]' })
  amendments: OcdsAmendment[];

  // ─── OCDS Criteria & Submission ──────────────────────────────────────

  /** Award criteria description */
  @Column({ nullable: true })
  awardCriteria: string;

  /** Detailed award criteria */
  @Column({ type: 'text', nullable: true })
  awardCriteriaDetails: string;

  /** Eligibility requirements */
  @Column({ type: 'text', nullable: true })
  eligibilityCriteria: string;

  /** Submission methods (e.g. electronicSubmission) */
  @Column('text', { array: true, nullable: true })
  submissionMethod: string[];

  /** Number of tenderers / bidders */
  @Column({ type: 'int', nullable: true })
  numberOfTenderers: number;

  // ─── OCDS Release metadata ──────────────────────────────────────────

  /** OCDS release tags */
  @Column('text', { array: true, default: "'{tender}'" })
  releaseTag: string[];

  /** Language (BCP47) */
  @Column({ default: 'es' })
  language: string;

  // ─── Existing fields ─────────────────────────────────────────────────

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
