import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BoardService } from './board.service';
import { Board } from '../entities/board.entity';
import { BoardColumn } from '../entities/board-column.entity';
import { BoardCard } from '../entities/board-card.entity';

/**
 * Mock fractional-indexing with a simple implementation
 * that generates lexicographically ordered keys.
 */
let mockCounter = 0;
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: (a: string | null, b: string | null) => {
    if (a !== null && b !== null) {
      // Between two positions: return midpoint string
      return a + 'V';
    }
    if (a !== null) {
      // After a: append incrementing character
      return a.charAt(0) + String(mockCounter++);
    }
    // From start: use incrementing key
    return 'a' + String(mockCounter++);
  },
}));

/**
 * Tests for the Kanban board service.
 * Validates board creation, card movement, and fractional indexing ordering.
 */
describe('BoardService', () => {
  let service: BoardService;
  let boardRepo: any;
  let columnRepo: any;
  let cardRepo: any;

  beforeEach(async () => {
    boardRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'board-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };

    columnRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'col-' + Math.random().toString(36).slice(2) })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    cardRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'card-' + Math.random().toString(36).slice(2) })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardService,
        { provide: getRepositoryToken(Board), useValue: boardRepo },
        { provide: getRepositoryToken(BoardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(BoardCard), useValue: cardRepo },
      ],
    }).compile();

    service = module.get(BoardService);
  });

  describe('createBoard', () => {
    it('should create a board with 6 default columns in order', async () => {
      // Mock getBoard after creation
      const savedColumns: any[] = [];
      columnRepo.save.mockImplementation((entity) => {
        savedColumns.push(entity);
        return Promise.resolve(entity);
      });

      boardRepo.findOne.mockResolvedValue({
        id: 'board-1',
        name: 'Licitaciones LYN',
        columns: savedColumns,
      });

      await service.createBoard({ name: 'Licitaciones LYN' });

      expect(columnRepo.save).toHaveBeenCalledTimes(6);

      const titles = savedColumns.map((c) => c.title);
      expect(titles).toEqual([
        'Nueva',
        'En revisión',
        'Preparando oferta',
        'Presentada',
        'Adjudicada',
        'Descartada',
      ]);

      // Verify positions are lexicographically ordered
      const positions = savedColumns.map((c) => c.position);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i - 1] < positions[i]).toBe(true);
      }
    });
  });

  describe('addCard', () => {
    it('should add a card at the end of a column', async () => {
      const existingCards = [
        { id: 'card-1', position: 'a0' },
        { id: 'card-2', position: 'a1' },
      ];
      columnRepo.findOne.mockResolvedValue({
        id: 'col-1',
        cards: existingCards,
      });

      await service.addCard('col-1', {
        title: 'Nueva licitación',
        tenderId: 'tender-1',
      });

      const created = cardRepo.create.mock.calls[0][0];
      expect(created.title).toBe('Nueva licitación');
      expect(created.tenderId).toBe('tender-1');
      expect(created.columnId).toBe('col-1');
      // Position should be after 'a1'
      expect(created.position > 'a1').toBe(true);
    });

    it('should add a card to an empty column', async () => {
      columnRepo.findOne.mockResolvedValue({
        id: 'col-1',
        cards: [],
      });

      await service.addCard('col-1', { title: 'First card' });

      const created = cardRepo.create.mock.calls[0][0];
      expect(created.position).toBeTruthy();
    });

    it('should throw when column not found', async () => {
      columnRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addCard('nonexistent', { title: 'test' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('moveCard', () => {
    it('should move card to a different column with new position', async () => {
      cardRepo.findOne.mockResolvedValue({
        id: 'card-1',
        columnId: 'col-1',
        position: 'a0',
      });

      await service.moveCard('card-1', {
        targetColumnId: 'col-2',
        afterPosition: 'a0',
        beforePosition: 'a1',
      });

      const saved = cardRepo.save.mock.calls[0][0];
      expect(saved.columnId).toBe('col-2');
      // Position should be between 'a0' and 'a1'
      expect(saved.position > 'a0').toBe(true);
      expect(saved.position < 'a1').toBe(true);
    });
  });

  describe('addTenderToBoard', () => {
    it('should create a card linked to a tender', async () => {
      columnRepo.findOne.mockResolvedValue({ id: 'col-1', cards: [] });

      await service.addTenderToBoard(
        'board-1',
        'col-1',
        'tender-123',
        'Licitación web',
        'Desarrollo de portal',
      );

      const created = cardRepo.create.mock.calls[0][0];
      expect(created.tenderId).toBe('tender-123');
      expect(created.title).toBe('Licitación web');
      expect(created.description).toBe('Desarrollo de portal');
    });
  });

  describe('getBoard', () => {
    it('should throw when board not found', async () => {
      boardRepo.findOne.mockResolvedValue(null);

      await expect(service.getBoard('nonexistent')).rejects.toThrow('not found');
    });

    it('should sort columns and cards by position', async () => {
      boardRepo.findOne.mockResolvedValue({
        id: 'board-1',
        columns: [
          { id: 'col-b', position: 'b', cards: [
            { id: 'card-2', position: 'b' },
            { id: 'card-1', position: 'a' },
          ]},
          { id: 'col-a', position: 'a', cards: [] },
        ],
      });

      const board = await service.getBoard('board-1');

      expect(board.columns[0].id).toBe('col-a');
      expect(board.columns[1].id).toBe('col-b');
      expect(board.columns[1].cards[0].id).toBe('card-1');
    });
  });
});
