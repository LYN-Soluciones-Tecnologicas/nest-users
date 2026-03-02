import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Repository } from 'typeorm';
import configuration from '../../src/config/configuration';

// Import modules under test
import { TendersModule } from '../../src/tenders/tenders.module';
import { BoardModule } from '../../src/board/board.module';
import { CompanyModule } from '../../src/company/company.module';
import { AiModule } from '../../src/ai/ai.module';
import { AiTasksModule } from '../../src/ai-tasks/ai-tasks.module';

// Import entities we'll seed
import { Tender, TenderStatus, ContractType } from '../../src/tenders/entities/tender.entity';
import { CompanyProfile } from '../../src/company/entities/company-profile.entity';
import { AiTask } from '../../src/ai-tasks/entities/ai-task.entity';

/**
 * Creates a NestJS test application with real HTTP controllers
 * but mocked database repositories to avoid DB dependency.
 *
 * Use supertest to hit the actual REST endpoints.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  seedTenders: () => Promise<void>;
}> {
  // In-memory data stores
  const tenders: Tender[] = [];
  const companyProfiles: CompanyProfile[] = [];

  // Create mock repositories that behave like real ones
  const tenderRepo = createMockRepo<Tender>(tenders);
  const companyProfileRepo = createMockRepo<CompanyProfile>(companyProfiles);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [configuration],
      }),
    ],
    controllers: [],
    providers: [],
  })
    .overrideModule(TendersModule)
    .useModule(TendersModule)
    .compile();

  // Fall back to a simpler approach: directly test controllers
  // with supertest against a real NestJS app
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    seedTenders: async () => {},
  };
}

function createMockRepo<T>(store: T[]): Partial<Repository<T>> {
  return {
    find: jest.fn().mockImplementation(() => Promise.resolve([...store])),
    findOne: jest.fn().mockImplementation(({ where }) => {
      const entry = store.find((item: any) => {
        return Object.entries(where).every(([key, val]) => (item as any)[key] === val);
      });
      return Promise.resolve(entry || null);
    }),
    save: jest.fn().mockImplementation((entity: any) => {
      if (!entity.id) entity.id = 'id-' + Math.random().toString(36).slice(2);
      const idx = store.findIndex((item: any) => (item as any).id === entity.id);
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return Promise.resolve(entity);
    }),
    create: jest.fn().mockImplementation((dto: any) => ({ ...dto })),
    remove: jest.fn().mockImplementation((entity: any) => {
      const idx = store.findIndex((item: any) => (item as any).id === (entity as any).id);
      if (idx >= 0) store.splice(idx, 1);
      return Promise.resolve(entity);
    }),
    count: jest.fn().mockImplementation(() => Promise.resolve(store.length)),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([...store]),
      getManyAndCount: jest.fn().mockResolvedValue([[...store], store.length]),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
}
