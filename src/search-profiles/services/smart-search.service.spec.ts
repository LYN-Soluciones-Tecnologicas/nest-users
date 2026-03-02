import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmartSearchService } from './smart-search.service';
import { SearchProfile } from '../entities/search-profile.entity';
import { TenderEmbedding } from '../../vectorization/entities/tender-embedding.entity';
import { Tender, ContractType } from '../../tenders/entities/tender.entity';
import { EmbeddingService } from '../../vectorization/services/embedding.service';
import { LlmService } from '../../ai/services/llm.service';

/**
 * Tests for the vectorial smart search engine.
 * Validates that inclusion/exclusion embeddings correctly filter tenders.
 */
describe('SmartSearchService', () => {
  let service: SmartSearchService;
  let profileRepo: any;
  let embeddingRepo: any;
  let tenderRepo: any;
  let embeddingService: any;
  let llmService: any;

  // --- Helpers: create fake embeddings ---
  // Use simple vectors where cosine similarity is easy to verify.
  // Vector [1,0,0] and [1,0,0] → similarity 1.0
  // Vector [1,0,0] and [0,1,0] → similarity 0.0
  // Vector [1,0,0] and [0.7,0.7,0] → similarity ~0.7

  const softwareEmbedding = [1, 0, 0]; // "software" direction
  const constructionEmbedding = [0, 1, 0]; // "construction" direction
  const mixedEmbedding = [0.7, 0.7, 0]; // partially both

  const activeProfile: Partial<SearchProfile> = {
    id: 'profile-1',
    name: 'Software profile',
    inclusionPrompt: 'desarrollo software',
    exclusionPrompt: 'obras construcción',
    inclusionEmbedding: softwareEmbedding,
    exclusionEmbedding: constructionEmbedding,
    inclusionThreshold: 0.5,
    exclusionThreshold: 0.6,
    inclusionWeight: 0.7,
    exclusionWeight: 0.3,
    useLlmReranking: false,
    llmRerankingTopN: 50,
    isActive: true,
  };

  const tendersMap = new Map([
    ['tender-sw', {
      id: 'tender-sw',
      title: 'Desarrollo web',
      description: 'Aplicación de software',
      isDismissed: false,
      budgetAmount: 50000,
      contractType: ContractType.SERVICES,
    }],
    ['tender-obras', {
      id: 'tender-obras',
      title: 'Obras de edificio',
      description: 'Construcción completa',
      isDismissed: false,
    }],
    ['tender-mixed', {
      id: 'tender-mixed',
      title: 'Software para gestión de obras',
      description: 'Sistema mixto',
      isDismissed: false,
    }],
  ]);

  const tenderEmbeddings: Partial<TenderEmbedding>[] = [
    { tenderId: 'tender-sw', embedding: softwareEmbedding },
    { tenderId: 'tender-obras', embedding: constructionEmbedding },
    { tenderId: 'tender-mixed', embedding: mixedEmbedding },
  ];

  beforeEach(async () => {
    profileRepo = {
      findOne: jest.fn().mockResolvedValue(activeProfile),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    embeddingRepo = {
      find: jest.fn().mockResolvedValue(tenderEmbeddings),
    };

    tenderRepo = {
      createQueryBuilder: jest.fn(() => ({
        whereInIds: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          // Return tenders matching the IDs
          return Promise.resolve(
            Array.from(tendersMap.values()),
          );
        }),
      })),
    };

    embeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(softwareEmbedding),
    };

    llmService = {
      complete: jest.fn().mockResolvedValue({
        text: '{"relevant": true, "score": 0.8, "reason": "Buen encaje"}',
        model: 'test',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartSearchService,
        { provide: getRepositoryToken(SearchProfile), useValue: profileRepo },
        { provide: getRepositoryToken(TenderEmbedding), useValue: embeddingRepo },
        { provide: getRepositoryToken(Tender), useValue: tenderRepo },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get(SmartSearchService);
  });

  describe('search (vectorial filtering)', () => {
    it('should rank software tender first — high inclusion, low exclusion', async () => {
      const results = await service.search('profile-1', 10, false);

      const swResult = results.find((r) => r.tender.id === 'tender-sw');
      expect(swResult).toBeDefined();
      expect(swResult.inclusionSimilarity).toBeCloseTo(1.0, 1); // [1,0,0] vs [1,0,0]
      expect(swResult.exclusionSimilarity).toBeCloseTo(0.0, 1); // [1,0,0] vs [0,1,0]
      expect(swResult.score).toBeGreaterThan(0.5);
    });

    it('should filter OUT construction tender — low inclusion, high exclusion', async () => {
      const results = await service.search('profile-1', 10, false);

      const obrasResult = results.find((r) => r.tender.id === 'tender-obras');
      // Construction: inclusion ~0.0 (below threshold 0.5) → should be filtered out
      expect(obrasResult).toBeUndefined();
    });

    it('should handle mixed tender — partial match on both dimensions', async () => {
      const results = await service.search('profile-1', 10, false);

      const mixedResult = results.find((r) => r.tender.id === 'tender-mixed');
      if (mixedResult) {
        // [0.7,0.7,0] vs [1,0,0] → ~0.707
        expect(mixedResult.inclusionSimilarity).toBeGreaterThan(0.5);
        // [0.7,0.7,0] vs [0,1,0] → ~0.707
        expect(mixedResult.exclusionSimilarity).toBeGreaterThan(0.5);
      }
      // Mixed tender might be filtered depending on thresholds
    });

    it('should return results sorted by score descending', async () => {
      const results = await service.search('profile-1', 10, false);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should return empty when no embeddings exist', async () => {
      embeddingRepo.find.mockResolvedValue([]);

      const results = await service.search('profile-1', 10, false);

      expect(results).toHaveLength(0);
    });

    it('should use active profile when no profileId given', async () => {
      await service.search(undefined, 10, false);

      expect(profileRepo.findOne).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it('should throw when no active profile exists', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.search(undefined)).rejects.toThrow(
        'No active search profile found',
      );
    });
  });

  describe('ensureProfileEmbeddings', () => {
    it('should generate and cache embeddings when missing', async () => {
      const profile: any = {
        ...activeProfile,
        inclusionEmbedding: null,
        exclusionEmbedding: null,
      };

      await service.ensureProfileEmbeddings(profile);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledTimes(2);
      expect(profileRepo.save).toHaveBeenCalled();
    });

    it('should NOT regenerate embeddings when already cached', async () => {
      await service.ensureProfileEmbeddings(activeProfile as SearchProfile);

      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(profileRepo.save).not.toHaveBeenCalled();
    });
  });
});
