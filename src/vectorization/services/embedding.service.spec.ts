import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmbeddingService } from './embedding.service';
import { TenderEmbedding } from '../entities/tender-embedding.entity';

/**
 * Tests for the embedding service.
 * Validates cosine similarity, embedding storage, and similarity search.
 */
describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let embeddingRepo: any;

  beforeEach(async () => {
    embeddingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto) => ({ ...dto, id: 'emb-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'embedding.provider') return 'local';
              return '';
            }),
          },
        },
        { provide: getRepositoryToken(TenderEmbedding), useValue: embeddingRepo },
      ],
    }).compile();

    service = module.get(EmbeddingService);
  });

  describe('cosine similarity (via findSimilar)', () => {
    it('should return similarity 1.0 for identical vectors', async () => {
      // We test cosineSimilarity indirectly through findSimilar
      embeddingRepo.find.mockResolvedValue([
        { tenderId: 'tender-1', embedding: [1, 0, 0] },
      ]);

      // Override generateEmbedding to return known vector
      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0, 0]);

      const results = await service.findSimilar('software', 10);

      expect(results[0].similarity).toBeCloseTo(1.0);
    });

    it('should return similarity 0.0 for orthogonal vectors', async () => {
      embeddingRepo.find.mockResolvedValue([
        { tenderId: 'tender-1', embedding: [0, 1, 0] },
      ]);

      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0, 0]);

      const results = await service.findSimilar('software', 10);

      expect(results[0].similarity).toBeCloseTo(0.0);
    });

    it('should return results sorted by similarity descending', async () => {
      embeddingRepo.find.mockResolvedValue([
        { tenderId: 'low', embedding: [0, 1, 0] },
        { tenderId: 'high', embedding: [0.9, 0.1, 0] },
        { tenderId: 'medium', embedding: [0.5, 0.5, 0] },
      ]);

      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0, 0]);

      const results = await service.findSimilar('query', 10);

      expect(results[0].tenderId).toBe('high');
      expect(results[1].tenderId).toBe('medium');
      expect(results[2].tenderId).toBe('low');
    });

    it('should respect limit parameter', async () => {
      embeddingRepo.find.mockResolvedValue([
        { tenderId: 'a', embedding: [1, 0, 0] },
        { tenderId: 'b', embedding: [0.9, 0.1, 0] },
        { tenderId: 'c', embedding: [0.5, 0.5, 0] },
      ]);

      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0, 0]);

      const results = await service.findSimilar('query', 2);

      expect(results).toHaveLength(2);
    });
  });

  describe('embedTender', () => {
    it('should create new embedding when none exists', async () => {
      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([0.1, 0.2, 0.3]);

      await service.embedTender('tender-1', 'Desarrollo web');

      expect(embeddingRepo.create).toHaveBeenCalled();
      const created = embeddingRepo.save.mock.calls[0][0];
      expect(created.tenderId).toBe('tender-1');
      expect(created.embeddedText).toBe('Desarrollo web');
    });

    it('should update existing embedding instead of duplicating', async () => {
      const existing = {
        id: 'emb-existing',
        tenderId: 'tender-1',
        embedding: [0, 0, 0],
        embeddedText: 'Old text',
      };
      embeddingRepo.findOne.mockResolvedValue(existing);
      jest.spyOn(service, 'generateEmbedding').mockResolvedValue([0.5, 0.5, 0]);

      await service.embedTender('tender-1', 'New text');

      const saved = embeddingRepo.save.mock.calls[0][0];
      expect(saved.id).toBe('emb-existing');
      expect(saved.embeddedText).toBe('New text');
      expect(saved.embedding).toEqual([0.5, 0.5, 0]);
    });
  });

  describe('fallback embedding', () => {
    it('should produce fixed-dimension vectors when ML models unavailable', async () => {
      // The local model will fail in test environment → triggers fallback
      const embedding = await service.generateEmbedding('test text');

      expect(embedding).toHaveLength(384);
      // Vector should be normalized (magnitude ≈ 1)
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      if (magnitude > 0) {
        expect(magnitude).toBeCloseTo(1.0, 1);
      }
    });

    it('should produce different vectors for different texts', async () => {
      const emb1 = await service.generateEmbedding('desarrollo software');
      const emb2 = await service.generateEmbedding('obras de construcción');

      // They shouldn't be identical
      const different = emb1.some((v, i) => v !== emb2[i]);
      expect(different).toBe(true);
    });
  });
});
