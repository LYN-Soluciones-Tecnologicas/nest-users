import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { BoardCard } from './entities/board-card.entity';
import { BoardService } from './services/board.service';
import { BoardController } from './board.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Board, BoardColumn, BoardCard])],
  controllers: [BoardController],
  providers: [BoardService],
  exports: [BoardService],
})
export class BoardModule {}
