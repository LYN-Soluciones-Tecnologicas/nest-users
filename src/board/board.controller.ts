import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BoardService } from './services/board.service';
import {
  CreateBoardDto,
  CreateColumnDto,
  CreateCardDto,
  MoveCardDto,
  MoveColumnDto,
} from './dto/board.dto';

@ApiTags('board')
@Controller('boards')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  // --- Boards ---

  @Get()
  @ApiOperation({ summary: 'List all boards' })
  listBoards() {
    return this.boardService.listBoards();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new board with default columns' })
  createBoard(@Body() dto: CreateBoardDto) {
    return this.boardService.createBoard(dto);
  }

  @Get(':boardId')
  @ApiOperation({ summary: 'Get board with all columns and cards' })
  getBoard(@Param('boardId') boardId: string) {
    return this.boardService.getBoard(boardId);
  }

  @Delete(':boardId')
  @ApiOperation({ summary: 'Delete a board' })
  deleteBoard(@Param('boardId') boardId: string) {
    return this.boardService.deleteBoard(boardId);
  }

  // --- Columns ---

  @Post(':boardId/columns')
  @ApiOperation({ summary: 'Add a column to a board' })
  addColumn(
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.boardService.addColumn(boardId, dto);
  }

  @Patch('columns/:columnId/move')
  @ApiOperation({ summary: 'Reorder a column' })
  moveColumn(
    @Param('columnId') columnId: string,
    @Body() dto: MoveColumnDto,
  ) {
    return this.boardService.moveColumn(columnId, dto);
  }

  @Delete('columns/:columnId')
  @ApiOperation({ summary: 'Delete a column' })
  deleteColumn(@Param('columnId') columnId: string) {
    return this.boardService.deleteColumn(columnId);
  }

  // --- Cards ---

  @Post('columns/:columnId/cards')
  @ApiOperation({ summary: 'Add a card to a column' })
  addCard(
    @Param('columnId') columnId: string,
    @Body() dto: CreateCardDto,
  ) {
    return this.boardService.addCard(columnId, dto);
  }

  @Patch('cards/:cardId')
  @ApiOperation({ summary: 'Update card details' })
  updateCard(
    @Param('cardId') cardId: string,
    @Body() dto: Partial<CreateCardDto>,
  ) {
    return this.boardService.updateCard(cardId, dto);
  }

  @Patch('cards/:cardId/move')
  @ApiOperation({ summary: 'Move card to another column or reorder' })
  moveCard(@Param('cardId') cardId: string, @Body() dto: MoveCardDto) {
    return this.boardService.moveCard(cardId, dto);
  }

  @Delete('cards/:cardId')
  @ApiOperation({ summary: 'Delete a card' })
  deleteCard(@Param('cardId') cardId: string) {
    return this.boardService.deleteCard(cardId);
  }
}
