import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TendersController } from '../src/tenders/tenders.controller';
import { TendersService } from '../src/tenders/services/tenders.service';
import { TenderStatus, ContractType } from '../src/tenders/entities/tender.entity';

/**
 * E2E tests for the Tenders REST API.
 * Tests HTTP routing, validation, response format, and status codes.
 */
describe('Tenders API (e2e)', () => {
  let app: INestApplication;
  let tendersService: Partial<TendersService>;

  const sampleTender = {
    id: 'uuid-1',
    title: 'Desarrollo plataforma web',
    description: 'Servicio de desarrollo de software a medida',
    contractingAuthority: 'Ayuntamiento de Madrid',
    cpvCodes: ['72200000'],
    budgetAmount: 80000,
    currency: 'EUR',
    status: TenderStatus.OPEN,
    contractType: ContractType.SERVICES,
    publicationDate: new Date('2026-02-15'),
    submissionDeadline: new Date('2026-04-01'),
    isSaved: false,
    isDismissed: false,
    relevanceScore: 0.85,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    tendersService = {
      search: jest.fn().mockResolvedValue({
        items: [sampleTender],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      findById: jest.fn().mockResolvedValue(sampleTender),
      saveTender: jest.fn().mockResolvedValue({ ...sampleTender, isSaved: true }),
      dismissTender: jest.fn().mockResolvedValue({ ...sampleTender, isDismissed: true }),
      getStats: jest.fn().mockResolvedValue({
        total: 150,
        saved: 12,
        dismissed: 5,
        bySource: [{ sourceId: 'placsp-nacional', count: '100' }],
        byStatus: [{ status: 'open', count: '80' }],
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TendersController],
      providers: [
        { provide: TendersService, useValue: tendersService },
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

  describe('GET /api/tenders', () => {
    it('should return paginated tender list', () => {
      return request(app.getHttpServer())
        .get('/api/tenders')
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toHaveLength(1);
          expect(res.body.total).toBe(1);
          expect(res.body.page).toBe(1);
          expect(res.body.totalPages).toBe(1);
        });
    });

    it('should pass query parameters to service', () => {
      return request(app.getHttpServer())
        .get('/api/tenders?q=software&status=open&minBudget=10000&page=2&limit=10')
        .expect(200)
        .expect(() => {
          const callArg = (tendersService.search as jest.Mock).mock.calls.at(-1)[0];
          expect(callArg.q).toBe('software');
          expect(callArg.status).toBe('open');
          expect(callArg.minBudget).toBe(10000);
          expect(callArg.page).toBe(2);
          expect(callArg.limit).toBe(10);
        });
    });

    it('should reject invalid limit (>100)', () => {
      return request(app.getHttpServer())
        .get('/api/tenders?limit=999')
        .expect(400);
    });
  });

  describe('GET /api/tenders/stats', () => {
    it('should return tender statistics', () => {
      return request(app.getHttpServer())
        .get('/api/tenders/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body.total).toBe(150);
          expect(res.body.saved).toBe(12);
          expect(res.body.dismissed).toBe(5);
          expect(res.body.bySource).toBeDefined();
        });
    });
  });

  describe('GET /api/tenders/:id', () => {
    it('should return a single tender', () => {
      return request(app.getHttpServer())
        .get('/api/tenders/uuid-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.title).toBe('Desarrollo plataforma web');
          expect(res.body.budgetAmount).toBe(80000);
        });
    });
  });

  describe('PATCH /api/tenders/:id/save', () => {
    it('should mark tender as saved', () => {
      return request(app.getHttpServer())
        .patch('/api/tenders/uuid-1/save')
        .expect(200)
        .expect((res) => {
          expect(res.body.isSaved).toBe(true);
        });
    });
  });

  describe('PATCH /api/tenders/:id/dismiss', () => {
    it('should mark tender as dismissed', () => {
      return request(app.getHttpServer())
        .patch('/api/tenders/uuid-1/dismiss')
        .expect(200)
        .expect((res) => {
          expect(res.body.isDismissed).toBe(true);
        });
    });
  });
});
