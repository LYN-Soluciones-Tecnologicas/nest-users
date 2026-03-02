import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiTaskService } from './ai-task.service';
import { AiTask } from '../entities/ai-task.entity';
import { AiTaskGroup } from '../entities/ai-task-group.entity';

/**
 * Tests for AI task CRUD, group management, and default seeding.
 */
describe('AiTaskService', () => {
  let service: AiTaskService;
  let taskRepo: any;
  let groupRepo: any;

  beforeEach(async () => {
    taskRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'task-' + Math.random().toString(36).slice(2) })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };

    groupRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'group-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiTaskService,
        { provide: getRepositoryToken(AiTask), useValue: taskRepo },
        { provide: getRepositoryToken(AiTaskGroup), useValue: groupRepo },
      ],
    }).compile();

    service = module.get(AiTaskService);
  });

  describe('seedDefaults', () => {
    it('should create 5 default task templates', async () => {
      taskRepo.findOne.mockResolvedValue(null); // None exist yet

      const tasks = await service.seedDefaults();

      expect(tasks).toHaveLength(5);
      const names = tasks.map((t) => t.name);
      expect(names).toContain('Resumen ejecutivo');
      expect(names).toContain('Criterios de adjudicación');
      expect(names).toContain('Requisitos de solvencia');
      expect(names).toContain('Propuesta técnica inicial');
      expect(names).toContain('Análisis de riesgos');
    });

    it('should not duplicate existing tasks', async () => {
      // First call: already exists
      taskRepo.findOne.mockResolvedValue({ id: 'existing', name: 'Resumen ejecutivo' });

      const tasks = await service.seedDefaults();

      // Should skip the already-existing one
      expect(tasks.length).toBeLessThan(5);
    });

    it('should set proper sort order on default tasks', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      const tasks = await service.seedDefaults();

      const sortOrders = tasks.map((t) => t.sortOrder);
      for (let i = 1; i < sortOrders.length; i++) {
        expect(sortOrders[i]).toBeGreaterThan(sortOrders[i - 1]);
      }
    });
  });

  describe('createGroup', () => {
    it('should create a group with specified tasks', async () => {
      const task1 = { id: 'task-1', name: 'Summary' };
      const task2 = { id: 'task-2', name: 'Criteria' };
      taskRepo.find.mockResolvedValue([task1, task2]);

      await service.createGroup({
        name: 'Análisis rápido',
        description: 'Resumen + Criterios',
        taskIds: ['task-1', 'task-2'],
      });

      const created = groupRepo.create.mock.calls[0][0];
      expect(created.name).toBe('Análisis rápido');
      expect(created.tasks).toHaveLength(2);
    });
  });

  describe('resolveTasks', () => {
    it('should resolve tasks from taskIds', async () => {
      const tasks = [{ id: 'task-1' }, { id: 'task-2' }];
      taskRepo.find.mockResolvedValue(tasks);

      const result = await service.resolveTasks(['task-1', 'task-2']);

      expect(result).toHaveLength(2);
    });

    it('should resolve tasks from groupId', async () => {
      groupRepo.findOne.mockResolvedValue({
        id: 'group-1',
        tasks: [{ id: 'task-1' }, { id: 'task-3' }],
      });

      const result = await service.resolveTasks(undefined, 'group-1');

      expect(result).toHaveLength(2);
    });

    it('should throw when neither taskIds nor groupId provided', async () => {
      await expect(service.resolveTasks()).rejects.toThrow(
        'Either taskIds or groupId must be provided',
      );
    });
  });
});
