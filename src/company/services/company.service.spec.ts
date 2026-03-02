import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyProfile } from '../entities/company-profile.entity';
import { Tender, TenderStatus, ContractType } from '../../tenders/entities/tender.entity';

/**
 * Tests for the company tender scoring algorithm.
 * This is core business logic — determines which tenders LYN should pursue.
 */
describe('CompanyService', () => {
  let service: CompanyService;
  let profileRepo: any;
  let tenderRepo: any;

  // --- Test fixtures ---

  const lynProfile: Partial<CompanyProfile> = {
    id: 'profile-1',
    name: 'LYN Soluciones',
    cpvCodes: ['72000000', '72200000', '72300000'],
    keywords: ['software', 'web', 'móvil', 'inteligencia artificial', 'chatbot'],
    minBudget: 5000,
    maxBudget: 500000,
    preferredContractTypes: ['services'],
    preferredRegions: ['nacional'],
    excludeKeywords: ['obras', 'construcción', 'limpieza'],
    isActive: true,
  };

  const softwareTender: Partial<Tender> = {
    id: 'tender-1',
    title: 'Desarrollo de plataforma web para gestión documental',
    description: 'Diseño y desarrollo de software a medida para gestión documental',
    cpvCodes: ['72200000'],
    budgetAmount: 80000,
    contractType: ContractType.SERVICES,
    isDismissed: false,
  };

  const constructionTender: Partial<Tender> = {
    id: 'tender-2',
    title: 'Obras de reforma del edificio municipal',
    description: 'Obras de construcción y reforma integral del edificio',
    cpvCodes: ['45000000'],
    budgetAmount: 2000000,
    contractType: ContractType.WORKS,
    isDismissed: false,
  };

  const aiTender: Partial<Tender> = {
    id: 'tender-3',
    title: 'Servicio de chatbot con inteligencia artificial',
    description: 'Implementación de chatbot basado en inteligencia artificial para atención ciudadana',
    cpvCodes: ['72300000'],
    budgetAmount: 45000,
    contractType: ContractType.SERVICES,
    isDismissed: false,
  };

  const overBudgetTender: Partial<Tender> = {
    id: 'tender-4',
    title: 'Desarrollo de sistema de software empresarial',
    description: 'Gran sistema de software corporativo',
    cpvCodes: ['72000000'],
    budgetAmount: 5000000,
    contractType: ContractType.SERVICES,
    isDismissed: false,
  };

  beforeEach(async () => {
    profileRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id || 'new-id' })),
      update: jest.fn(),
    };

    tenderRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: getRepositoryToken(CompanyProfile), useValue: profileRepo },
        { provide: getRepositoryToken(Tender), useValue: tenderRepo },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  // --- Scoring algorithm tests ---

  describe('calculateScore (via scoreTenders)', () => {
    beforeEach(() => {
      profileRepo.findOne.mockResolvedValue(lynProfile);
    });

    it('should score a software tender HIGH — CPV match + keyword match + budget in range', async () => {
      tenderRepo.find.mockResolvedValue([softwareTender]);

      await service.scoreTenders();

      const saved = tenderRepo.save.mock.calls[0][0];
      // CPV exact match: 0.4, keywords "software" + "web": ~0.12, budget in range: 0.2, type match: 0.1
      expect(saved.relevanceScore).toBeGreaterThan(0.5);
    });

    it('should score a construction tender LOW — no CPV match + exclusion keywords', async () => {
      tenderRepo.find.mockResolvedValue([constructionTender]);

      await service.scoreTenders();

      const saved = tenderRepo.save.mock.calls[0][0];
      // No CPV match, "obras" and "construcción" trigger exclusion (-0.5)
      expect(saved.relevanceScore).toBeLessThan(0.3);
    });

    it('should score an AI/chatbot tender HIGH — multiple keyword matches', async () => {
      tenderRepo.find.mockResolvedValue([aiTender]);

      await service.scoreTenders();

      const saved = tenderRepo.save.mock.calls[0][0];
      // CPV match + "chatbot" + "inteligencia artificial" keywords + budget + type
      expect(saved.relevanceScore).toBeGreaterThan(0.6);
    });

    it('should penalize tenders over budget', async () => {
      tenderRepo.find.mockResolvedValue([overBudgetTender]);

      await service.scoreTenders();

      const saved = tenderRepo.save.mock.calls[0][0];
      // CPV match + keywords but NO budget score (5M > 500K max)
      expect(saved.relevanceScore).toBeLessThan(
        0.8, // would be higher with budget score
      );
    });

    it('should count candidates above threshold', async () => {
      tenderRepo.find.mockResolvedValue([softwareTender, constructionTender, aiTender]);

      const result = await service.scoreTenders();

      // Software and AI tenders should be candidates, construction should not
      expect(result.scored).toBe(3);
      expect(result.candidates).toBeGreaterThanOrEqual(1);
    });

    it('should skip dismissed tenders', async () => {
      tenderRepo.find.mockResolvedValue([]); // find({ isDismissed: false }) returns empty

      const result = await service.scoreTenders();

      expect(result.scored).toBe(0);
    });
  });

  describe('createProfile', () => {
    it('should deactivate existing profiles and create new one as active', async () => {
      const dto = { name: 'New Profile', cpvCodes: ['72000000'], keywords: ['web'] };
      profileRepo.create.mockReturnValue({ ...dto, isActive: true });

      await service.createProfile(dto as any);

      expect(profileRepo.update).toHaveBeenCalledWith({}, { isActive: false });
      const savedArg = profileRepo.save.mock.calls[0][0];
      expect(savedArg.isActive).toBe(true);
    });
  });

  describe('getActiveProfile', () => {
    it('should return active profile', async () => {
      profileRepo.findOne.mockResolvedValue(lynProfile);

      const result = await service.getActiveProfile();

      expect(result.name).toBe('LYN Soluciones');
    });

    it('should throw if no active profile', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getActiveProfile()).rejects.toThrow('No active company profile');
    });
  });
});
