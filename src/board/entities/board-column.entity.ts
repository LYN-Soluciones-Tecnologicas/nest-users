import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Board } from './board.entity';
import { BoardCard } from './board-card.entity';

@Entity('board_columns')
@Index(['boardId', 'position'])
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  /** Lexicographic position for ordering (fractional indexing) */
  @Column({ type: 'varchar', length: 50 })
  position: string;

  @Column()
  boardId: string;

  @ManyToOne(() => Board, (board) => board.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boardId' })
  board: Board;

  @OneToMany(() => BoardCard, (card) => card.column, {
    cascade: true,
    eager: true,
  })
  cards: BoardCard[];
}
