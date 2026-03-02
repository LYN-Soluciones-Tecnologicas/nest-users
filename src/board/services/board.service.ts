import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from '../entities/board.entity';
import { BoardColumn } from '../entities/board-column.entity';
import { BoardCard } from '../entities/board-card.entity';
import {
  CreateBoardDto,
  CreateColumnDto,
  CreateCardDto,
  MoveCardDto,
  MoveColumnDto,
} from '../dto/board.dto';
import { generateKeyBetween } from 'fractional-indexing';

@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);

  constructor(
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnRepo: Repository<BoardColumn>,
    @InjectRepository(BoardCard)
    private readonly cardRepo: Repository<BoardCard>,
  ) {}

  // --- Board CRUD ---

  async createBoard(dto: CreateBoardDto): Promise<Board> {
    const board = this.boardRepo.create(dto);
    const saved = await this.boardRepo.save(board);

    // Create default columns
    const defaultColumns = [
      'Nueva',
      'En revisión',
      'Preparando oferta',
      'Presentada',
      'Adjudicada',
      'Descartada',
    ];

    let prevPosition: string | null = null;
    for (const title of defaultColumns) {
      const position = generateKeyBetween(prevPosition, null);
      await this.columnRepo.save(
        this.columnRepo.create({
          title,
          position,
          boardId: saved.id,
        }),
      );
      prevPosition = position;
    }

    return this.getBoard(saved.id);
  }

  async getBoard(id: string): Promise<Board> {
    const board = await this.boardRepo.findOne({
      where: { id },
      relations: ['columns', 'columns.cards'],
    });
    if (!board) throw new NotFoundException(`Board ${id} not found`);

    // Sort columns and cards by position
    board.columns.sort((a, b) => a.position.localeCompare(b.position));
    for (const col of board.columns) {
      col.cards?.sort((a, b) => a.position.localeCompare(b.position));
    }

    return board;
  }

  async listBoards(): Promise<Board[]> {
    return this.boardRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deleteBoard(id: string): Promise<void> {
    const board = await this.getBoard(id);
    await this.boardRepo.remove(board);
  }

  // --- Column operations ---

  async addColumn(boardId: string, dto: CreateColumnDto): Promise<BoardColumn> {
    const board = await this.getBoard(boardId);

    let afterPosition: string | null = null;
    if (dto.afterColumnId) {
      const afterCol = board.columns.find((c) => c.id === dto.afterColumnId);
      if (afterCol) afterPosition = afterCol.position;
    } else {
      // Add at end
      const lastCol = board.columns[board.columns.length - 1];
      afterPosition = lastCol?.position || null;
    }

    const position = generateKeyBetween(afterPosition, null);

    const column = this.columnRepo.create({
      title: dto.title,
      position,
      boardId,
    });

    return this.columnRepo.save(column);
  }

  async moveColumn(
    columnId: string,
    dto: MoveColumnDto,
  ): Promise<BoardColumn> {
    const column = await this.columnRepo.findOne({ where: { id: columnId } });
    if (!column) throw new NotFoundException(`Column ${columnId} not found`);

    column.position = generateKeyBetween(
      dto.afterPosition || null,
      dto.beforePosition || null,
    );

    return this.columnRepo.save(column);
  }

  async deleteColumn(columnId: string): Promise<void> {
    const column = await this.columnRepo.findOne({ where: { id: columnId } });
    if (!column) throw new NotFoundException(`Column ${columnId} not found`);
    await this.columnRepo.remove(column);
  }

  // --- Card operations ---

  async addCard(columnId: string, dto: CreateCardDto): Promise<BoardCard> {
    const column = await this.columnRepo.findOne({
      where: { id: columnId },
      relations: ['cards'],
    });
    if (!column) throw new NotFoundException(`Column ${columnId} not found`);

    // Add at end of column
    const cards = (column.cards || []).sort((a, b) =>
      a.position.localeCompare(b.position),
    );
    const lastCard = cards[cards.length - 1];
    const position = generateKeyBetween(lastCard?.position || null, null);

    const card = this.cardRepo.create({
      ...dto,
      columnId,
      position,
    });

    return this.cardRepo.save(card);
  }

  async moveCard(cardId: string, dto: MoveCardDto): Promise<BoardCard> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);

    card.columnId = dto.targetColumnId;
    card.position = generateKeyBetween(
      dto.afterPosition || null,
      dto.beforePosition || null,
    );

    return this.cardRepo.save(card);
  }

  async updateCard(
    cardId: string,
    updates: Partial<CreateCardDto>,
  ): Promise<BoardCard> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);

    Object.assign(card, updates);
    return this.cardRepo.save(card);
  }

  async deleteCard(cardId: string): Promise<void> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);
    await this.cardRepo.remove(card);
  }

  // --- Quick action: add tender to board ---

  async addTenderToBoard(
    boardId: string,
    columnId: string,
    tenderId: string,
    title: string,
    description?: string,
  ): Promise<BoardCard> {
    return this.addCard(columnId, {
      tenderId,
      title,
      description,
    });
  }
}
