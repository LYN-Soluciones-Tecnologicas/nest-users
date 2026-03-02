import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { BoardController } from '../src/board/board.controller';
import { BoardService } from '../src/board/services/board.service';

// Mock fractional-indexing (ESM module) before imports resolve
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: jest.fn((a, b) => a ? a + '1' : 'a0'),
}));

/**
 * E2E tests for the Kanban Board REST API.
 * Tests the full board/column/card lifecycle through HTTP.
 */
describe('Board API (e2e)', () => {
  let app: INestApplication;
  let boardService: Partial<BoardService>;

  const sampleBoard = {
    id: 'board-1',
    name: 'Licitaciones LYN 2026',
    description: 'Tablero principal',
    columns: [
      {
        id: 'col-1',
        title: 'Nueva',
        position: 'a0',
        boardId: 'board-1',
        cards: [],
      },
      {
        id: 'col-2',
        title: 'En revisión',
        position: 'a1',
        boardId: 'board-1',
        cards: [
          {
            id: 'card-1',
            title: 'Licitación web municipal',
            tenderId: 'tender-1',
            position: 'a0',
            columnId: 'col-2',
            labels: ['urgente'],
            metadata: { budgetAmount: 80000 },
          },
        ],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    boardService = {
      createBoard: jest.fn().mockResolvedValue(sampleBoard),
      getBoard: jest.fn().mockResolvedValue(sampleBoard),
      listBoards: jest.fn().mockResolvedValue([sampleBoard]),
      deleteBoard: jest.fn().mockResolvedValue(undefined),
      addColumn: jest.fn().mockResolvedValue({
        id: 'col-new',
        title: 'Archivada',
        position: 'a5',
        boardId: 'board-1',
      }),
      moveColumn: jest.fn().mockResolvedValue({
        id: 'col-1',
        position: 'a3',
      }),
      deleteColumn: jest.fn().mockResolvedValue(undefined),
      addCard: jest.fn().mockResolvedValue({
        id: 'card-new',
        title: 'Nueva licitación IA',
        tenderId: 'tender-2',
        position: 'a0',
        columnId: 'col-1',
      }),
      moveCard: jest.fn().mockResolvedValue({
        id: 'card-1',
        columnId: 'col-2',
        position: 'a1',
      }),
      updateCard: jest.fn().mockResolvedValue({
        id: 'card-1',
        notes: 'Revisar pliegos antes del viernes',
      }),
      deleteCard: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BoardController],
      providers: [
        { provide: BoardService, useValue: boardService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Board CRUD ---

  describe('POST /api/boards', () => {
    it('should create a new board', () => {
      return request(app.getHttpServer())
        .post('/api/boards')
        .send({ name: 'Licitaciones LYN 2026' })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Licitaciones LYN 2026');
          expect(res.body.columns).toBeDefined();
        });
    });

    it('should reject board without name', () => {
      return request(app.getHttpServer())
        .post('/api/boards')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/boards', () => {
    it('should list all boards', () => {
      return request(app.getHttpServer())
        .get('/api/boards')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body).toHaveLength(1);
        });
    });
  });

  describe('GET /api/boards/:id', () => {
    it('should return a board with columns and cards', () => {
      return request(app.getHttpServer())
        .get('/api/boards/board-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.columns).toHaveLength(2);
          expect(res.body.columns[1].cards).toHaveLength(1);
        });
    });
  });

  // --- Card operations ---

  describe('POST /api/boards/columns/:columnId/cards', () => {
    it('should add a card to a column', () => {
      return request(app.getHttpServer())
        .post('/api/boards/columns/col-1/cards')
        .send({
          title: 'Nueva licitación IA',
          tenderId: '00000000-0000-4000-a000-000000000002',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.title).toBe('Nueva licitación IA');
          expect(res.body.tenderId).toBe('tender-2');
        });
    });
  });

  describe('PATCH /api/boards/cards/:cardId/move', () => {
    it('should move a card between columns', () => {
      return request(app.getHttpServer())
        .patch('/api/boards/cards/card-1/move')
        .send({
          targetColumnId: '00000000-0000-4000-a000-000000000010',
          afterPosition: 'a0',
          beforePosition: 'a2',
        })
        .expect(200);
    });
  });

  describe('PATCH /api/boards/cards/:cardId', () => {
    it('should update card notes', () => {
      return request(app.getHttpServer())
        .patch('/api/boards/cards/card-1')
        .send({ notes: 'Revisar pliegos antes del viernes' })
        .expect(200)
        .expect((res) => {
          expect(res.body.notes).toBe('Revisar pliegos antes del viernes');
        });
    });
  });

});
