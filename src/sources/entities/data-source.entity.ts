import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('data_sources')
export class DataSourceEntity {
  /** Unique source identifier (e.g. 'placsp-nacional', 'euskadi', 'cataluna', 'galicia') */
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  region: string;

  @Column({ default: true })
  enabled: boolean;

  /** Cron expression for scheduled fetching */
  @Column({ default: '0 6 * * *' })
  fetchSchedule: string;

  /** Last successful fetch timestamp */
  @Column({ type: 'timestamp', nullable: true })
  lastFetchAt: Date;

  /** Pagination cursor / token for incremental fetching */
  @Column({ type: 'text', nullable: true })
  lastPageToken: string;

  /** Number of tenders imported from this source */
  @Column({ default: 0 })
  tenderCount: number;

  /** Last fetch error message */
  @Column({ type: 'text', nullable: true })
  lastError: string;

  /** Source-specific configuration */
  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
