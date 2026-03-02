import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PipelineController } from '../src/pipeline/pipeline.controller';
import { DailyPipelineService } from '../src/pipeline/services/daily-pipeline.service';
import { DailyReport } from '../src/pipeline/entities/daily-report.entity';

/**
 * E2E tests for the Pipeline REST API.
 * Tests pipeline execution trigger and report retrieval.
 */
describe('Pipeline API (e2e)', () => {
  let app: INestApplication;
  let pipelineService: Partial<DailyPipelineService>;
  let reportRepo: any;

  const sampleReport = {
    id: 'report-1',
    reportDate: '2026-03-01',
    totalDetected: 45,
    afterStrategicFilter: 12,
    afterPrioritization: 5,
    topOpportunities: [
      {
        tenderId: 'tender-1',
        title: 'Desarrollo web municipal',
        score: 0.92,
        reason: 'Muy alineado con capacidades de LYN',
        budgetAmount: 80000,
      },
      {
        tenderId: 'tender-2',
        title: 'App móvil turismo',
        score: 0.85,
        reason: 'Desarrollo móvil es competencia core',
        budgetAmount: 45000,
      },
    ],
    summary: '# Informe diario\n\n## Resumen\nSe detectaron 45 licitaciones...',
    durationMs: 15000,
    errors: [],
    status: 'completed',
    createdAt: new Date(),
  };

  beforeAll(async () => {
    pipelineService = {
      run: jest.fn().mockResolvedValue(sampleReport),
    };

    reportRepo = {
      find: jest.fn().mockResolvedValue([sampleReport]),
      findOne: jest.fn().mockResolvedValue(sampleReport),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PipelineController],
      providers: [
        { provide: DailyPipelineService, useValue: pipelineService },
        { provide: getRepositoryToken(DailyReport), useValue: reportRepo },
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

  describe('POST /api/pipeline/run', () => {
    it('should execute the daily pipeline and return a report', () => {
      return request(app.getHttpServer())
        .post('/api/pipeline/run')
        .expect(200)
        .expect((res) => {
          expect(res.body.totalDetected).toBe(45);
          expect(res.body.afterStrategicFilter).toBe(12);
          expect(res.body.topOpportunities).toHaveLength(2);
          expect(res.body.summary).toContain('Informe diario');
          expect(res.body.status).toBe('completed');
        });
    });
  });

  describe('GET /api/pipeline/reports', () => {
    it('should list daily reports', () => {
      return request(app.getHttpServer())
        .get('/api/pipeline/reports')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body[0].reportDate).toBe('2026-03-01');
        });
    });
  });

  describe('GET /api/pipeline/reports/latest', () => {
    it('should return the latest report', () => {
      return request(app.getHttpServer())
        .get('/api/pipeline/reports/latest')
        .expect(200)
        .expect((res) => {
          expect(res.body.topOpportunities[0].title).toBe('Desarrollo web municipal');
        });
    });
  });

  describe('GET /api/pipeline/reports/:id', () => {
    it('should return a specific report', () => {
      return request(app.getHttpServer())
        .get('/api/pipeline/reports/report-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.durationMs).toBe(15000);
        });
    });
  });
});
