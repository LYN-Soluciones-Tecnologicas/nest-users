import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AiTasksController } from '../src/ai-tasks/ai-tasks.controller';
import { AiTaskService } from '../src/ai-tasks/services/ai-task.service';
import { TaskExecutorService } from '../src/ai-tasks/services/task-executor.service';
import { ExecutionStatus } from '../src/ai-tasks/entities/ai-task-execution.entity';

/**
 * E2E tests for the AI Tasks REST API.
 * Tests task CRUD, group management, and task execution endpoints.
 */
describe('AI Tasks API (e2e)', () => {
  let app: INestApplication;
  let taskService: Partial<AiTaskService>;
  let executor: Partial<TaskExecutorService>;

  // Use valid UUIDs since DTOs validate with @IsUUID
  const TASK_UUID = '00000000-0000-4000-a000-000000000001';
  const TENDER_UUID = '00000000-0000-4000-a000-000000000002';
  const GROUP_UUID = '00000000-0000-4000-a000-000000000003';
  const EXEC_UUID = '00000000-0000-4000-a000-000000000004';

  const sampleTask = {
    id: TASK_UUID,
    name: 'Resumen ejecutivo',
    description: 'Genera un resumen de la licitación',
    systemPrompt: 'Eres un analista.',
    promptTemplate: 'Resume: {{tenderTitle}} - {{tenderDescription}}',
    maxTokens: 1000,
    temperature: 0.3,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
  };

  const sampleGroup = {
    id: GROUP_UUID,
    name: 'Análisis rápido',
    description: 'Resumen + Criterios',
    tasks: [sampleTask],
    isActive: true,
  };

  const sampleExecution = {
    id: EXEC_UUID,
    tenderId: TENDER_UUID,
    taskId: TASK_UUID,
    task: sampleTask,
    status: ExecutionStatus.COMPLETED,
    result: 'Esta licitación trata sobre desarrollo web para el ayuntamiento...',
    model: 'gpt-4o-mini',
    usage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
    durationMs: 2500,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    taskService = {
      createTask: jest.fn().mockResolvedValue(sampleTask),
      updateTask: jest.fn().mockResolvedValue({ ...sampleTask, name: 'Updated' }),
      findTask: jest.fn().mockResolvedValue(sampleTask),
      listTasks: jest.fn().mockResolvedValue([sampleTask]),
      deleteTask: jest.fn().mockResolvedValue(undefined),
      seedDefaults: jest.fn().mockResolvedValue([sampleTask]),
      createGroup: jest.fn().mockResolvedValue(sampleGroup),
      updateGroup: jest.fn().mockResolvedValue(sampleGroup),
      findGroup: jest.fn().mockResolvedValue(sampleGroup),
      listGroups: jest.fn().mockResolvedValue([sampleGroup]),
      deleteGroup: jest.fn().mockResolvedValue(undefined),
      resolveTasks: jest.fn().mockResolvedValue([sampleTask]),
    };

    executor = {
      executeTasks: jest.fn().mockResolvedValue([sampleExecution]),
      getExecutionsForTender: jest.fn().mockResolvedValue([sampleExecution]),
      reExecute: jest.fn().mockResolvedValue(sampleExecution),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AiTasksController],
      providers: [
        { provide: AiTaskService, useValue: taskService },
        { provide: TaskExecutorService, useValue: executor },
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

  // --- Task CRUD ---

  describe('POST /api/ai-tasks/tasks', () => {
    it('should create a new task template', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/tasks')
        .send({
          name: 'Resumen ejecutivo',
          promptTemplate: 'Resume: {{tenderTitle}}',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Resumen ejecutivo');
        });
    });

    it('should reject task without promptTemplate', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/tasks')
        .send({ name: 'No template' })
        .expect(400);
    });
  });

  describe('GET /api/ai-tasks/tasks', () => {
    it('should list all task templates', () => {
      return request(app.getHttpServer())
        .get('/api/ai-tasks/tasks')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('POST /api/ai-tasks/tasks/seed-defaults', () => {
    it('should seed default tasks', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/tasks/seed-defaults')
        .expect(201);
    });
  });

  // --- Group CRUD ---

  describe('POST /api/ai-tasks/groups', () => {
    it('should create a task group', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/groups')
        .send({
          name: 'Análisis rápido',
          taskIds: [TASK_UUID],
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Análisis rápido');
          expect(res.body.tasks).toHaveLength(1);
        });
    });

    it('should reject group without taskIds', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/groups')
        .send({ name: 'No tasks' })
        .expect(400);
    });
  });

  // --- Execution ---

  describe('POST /api/ai-tasks/execute', () => {
    it('should execute tasks on tenders and return results', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/execute')
        .send({
          tenderIds: [TENDER_UUID],
          taskIds: [TASK_UUID],
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0].status).toBe('completed');
          expect(res.body[0].result).toContain('desarrollo web');
        });
    });

    it('should execute tasks by group', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/execute')
        .send({
          tenderIds: [TENDER_UUID],
          groupId: GROUP_UUID,
        })
        .expect(200);
    });

    it('should reject without tenderIds', () => {
      return request(app.getHttpServer())
        .post('/api/ai-tasks/execute')
        .send({ taskIds: [TASK_UUID] })
        .expect(400);
    });
  });

  describe('GET /api/ai-tasks/executions/tender/:tenderId', () => {
    it('should return all execution results for a tender', () => {
      return request(app.getHttpServer())
        .get(`/api/ai-tasks/executions/tender/${TENDER_UUID}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0].model).toBe('gpt-4o-mini');
        });
    });
  });

  describe('POST /api/ai-tasks/executions/:id/retry', () => {
    it('should re-execute a task', () => {
      return request(app.getHttpServer())
        .post(`/api/ai-tasks/executions/${EXEC_UUID}/retry`)
        .expect(200);
    });
  });
});
