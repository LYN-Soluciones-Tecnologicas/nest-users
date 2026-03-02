import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** CPV codes the company can bid on */
  @Column('text', { array: true, default: '{}' })
  cpvCodes: string[];

  /** Keywords describing company capabilities */
  @Column('text', { array: true, default: '{}' })
  keywords: string[];

  /** Max contract value the company typically handles */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  maxBudget: number;

  /** Min contract value worth pursuing */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  minBudget: number;

  /** Preferred contract types */
  @Column('text', { array: true, default: '{}' })
  preferredContractTypes: string[];

  /** Regions of interest */
  @Column('text', { array: true, default: '{}' })
  preferredRegions: string[];

  /** Exclude tenders containing these keywords */
  @Column('text', { array: true, default: '{}' })
  excludeKeywords: string[];

  /** Is this the active profile? */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
