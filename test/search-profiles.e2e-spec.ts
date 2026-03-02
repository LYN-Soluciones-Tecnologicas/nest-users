import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { SearchProfilesController } from '../src/search-profiles/search-profiles.controller';
import { SearchProfileService } from '../src/search-profiles/services/search-profile.service';
import { SmartSearchService } from '../src/search-profiles/services/smart-search.service';
import { ContractType } from '../src/tenders/entities/tender.entity';

/**
 * E2E tests for the Search Profiles & Smart Search REST API.
 * Tests profile CRUD and the vectorial search endpoint.
 */
describe('Search Profiles API (e2e)', () => {
  let app: INestApplication;
  let profileService: Partial<SearchProfileService>;
  let smartSearchService: Partial<SmartSearchService>;

  const sampleProfile = {
    id: 'profile-1',
    name: 'Desarrollo Software LYN',
    inclusionPrompt: 'desarrollo software, web, móvil, IA, chatbots',
    exclusionPrompt: 'ENS alto, ISO 27001, obras, construcción',
    inclusionThreshold: 0.5,
    exclusionThreshold: 0.6,
    inclusionWeight: 0.7,
    exclusionWeight: 0.3,
    useLlmReranking: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const searchResults = [
    {
      tender: {
        id: 'tender-1',
        title: 'Desarrollo plataforma web educativa',
        budgetAmount: 95000,
        contractType: ContractType.SERVICES,
      },
      score: 0.82,
      inclusionSimilarity: 0.91,
      exclusionSimilarity: 0.12,
    },
    {
      tender: {
        id: 'tender-2',
        title: 'App móvil para turismo',
        budgetAmount: 45000,
        contractType: ContractType.SERVICES,
      },
      score: 0.76,
      inclusionSimilarity: 0.85,
      exclusionSimilarity: 0.08,
    },
  ];

  beforeAll(async () => {
    profileService = {
      create: jest.fn().mockResolvedValue(sampleProfile),
      update: jest.fn().mockResolvedValue({ ...sampleProfile, name: 'Updated' }),
      findById: jest.fn().mockResolvedValue(sampleProfile),
      getActive: jest.fn().mockResolvedValue(sampleProfile),
      list: jest.fn().mockResolvedValue([sampleProfile]),
      activate: jest.fn().mockResolvedValue(sampleProfile),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    smartSearchService = {
      search: jest.fn().mockResolvedValue(searchResults),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SearchProfilesController],
      providers: [
        { provide: SearchProfileService, useValue: profileService },
        { provide: SmartSearchService, useValue: smartSearchService },
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

  // --- Profile CRUD ---

  describe('POST /api/search-profiles', () => {
    it('should create a search profile with inclusion/exclusion prompts', () => {
      return request(app.getHttpServer())
        .post('/api/search-profiles')
        .send({
          name: 'Desarrollo Software LYN',
          inclusionPrompt: 'desarrollo software, web, móvil, IA, chatbots',
          exclusionPrompt: 'ENS alto, ISO 27001, obras',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Desarrollo Software LYN');
          expect(res.body.isActive).toBe(true);
        });
    });

    it('should reject without inclusionPrompt', () => {
      return request(app.getHttpServer())
        .post('/api/search-profiles')
        .send({ name: 'Bad profile' })
        .expect(400);
    });

    it('should reject invalid threshold values (>1)', () => {
      return request(app.getHttpServer())
        .post('/api/search-profiles')
        .send({
          name: 'Bad thresholds',
          inclusionPrompt: 'test',
          inclusionThreshold: 5.0,
        })
        .expect(400);
    });
  });

  describe('GET /api/search-profiles', () => {
    it('should list all profiles', () => {
      return request(app.getHttpServer())
        .get('/api/search-profiles')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('GET /api/search-profiles/active', () => {
    it('should return the active profile', () => {
      return request(app.getHttpServer())
        .get('/api/search-profiles/active')
        .expect(200)
        .expect((res) => {
          expect(res.body.isActive).toBe(true);
          expect(res.body.inclusionPrompt).toContain('software');
        });
    });
  });

  // --- Smart Search ---

  describe('POST /api/search-profiles/search', () => {
    it('should execute vectorial search and return scored tenders', () => {
      return request(app.getHttpServer())
        .post('/api/search-profiles/search')
        .send({ limit: 50 })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveLength(2);
          // Results should include vectorial scores
          expect(res.body[0].score).toBeDefined();
          expect(res.body[0].inclusionSimilarity).toBeDefined();
          expect(res.body[0].exclusionSimilarity).toBeDefined();
          expect(res.body[0].tender).toBeDefined();
        });
    });

    it('should accept profileId override', () => {
      return request(app.getHttpServer())
        .post('/api/search-profiles/search')
        .send({
          profileId: 'profile-1',
          limit: 10,
          useLlmReranking: true,
        })
        .expect(201)
        .expect(() => {
          const callArgs = (smartSearchService.search as jest.Mock).mock.calls.at(-1);
          expect(callArgs[0]).toBe('profile-1');
          expect(callArgs[1]).toBe(10);
          expect(callArgs[2]).toBe(true);
        });
    });
  });
});
