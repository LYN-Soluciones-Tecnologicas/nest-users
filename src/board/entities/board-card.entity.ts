import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BoardColumn } from './board-column.entity';

@Entity('board_cards')
@Index(['columnId', 'position'])
export class BoardCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Reference to the tender */
  @Column({ nullable: true })
  tenderId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Lexicographic position for ordering (fractional indexing) */
  @Column({ type: 'varchar', length: 50 })
  position: string;

  @Column()
  columnId: string;

  @ManyToOne(() => BoardColumn, (col) => col.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'columnId' })
  column: BoardColumn;

  /** Labels for categorization */
  @Column('text', { array: true, default: '{}' })
  labels: string[];

  /** Due date for the card */
  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  /** Notes added by the user */
  @Column({ type: 'text', nullable: true })
  notes: string;

  /** Extra metadata (budget, CPV, source, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
