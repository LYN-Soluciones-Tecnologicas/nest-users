import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiTaskService } from './services/ai-task.service';
import { TaskExecutorService } from './services/task-executor.service';
import {
  CreateAiTaskDto,
  UpdateAiTaskDto,
  CreateAiTaskGroupDto,
  UpdateAiTaskGroupDto,
  ExecuteTasksDto,
} from './dto/ai-task.dto';

@ApiTags('ai-tasks')
@Controller('ai-tasks')
export class AiTasksController {
  constructor(
    private readonly taskService: AiTaskService,
    private readonly executor: TaskExecutorService,
  ) {}

  // --- Task CRUD ---

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new AI task template' })
  async createTask(@Body() dto: CreateAiTaskDto) {
    return this.taskService.createTask(dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List all AI task templates' })
  async listTasks() {
    return this.taskService.listTasks();
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get an AI task by ID' })
  async findTask(@Param('id') id: string) {
    return this.taskService.findTask(id);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update an AI task template' })
  async updateTask(@Param('id') id: string, @Body() dto: UpdateAiTaskDto) {
    return this.taskService.updateTask(id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete an AI task' })
  async deleteTask(@Param('id') id: string) {
    await this.taskService.deleteTask(id);
    return { deleted: true };
  }

  @Post('tasks/seed-defaults')
  @ApiOperation({
    summary: 'Create default AI task templates',
    description:
      'Creates: Resumen ejecutivo, Criterios de adjudicación, Requisitos de solvencia, Propuesta técnica inicial, Análisis de riesgos',
  })
  async seedDefaults() {
    return this.taskService.seedDefaults();
  }

  // --- Group CRUD ---

  @Post('groups')
  @ApiOperation({ summary: 'Create an AI task group' })
  async createGroup(@Body() dto: CreateAiTaskGroupDto) {
    return this.taskService.createGroup(dto);
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all AI task groups' })
  async listGroups() {
    return this.taskService.listGroups();
  }

  @Get('groups/:id')
  @ApiOperation({ summary: 'Get an AI task group by ID' })
  async findGroup(@Param('id') id: string) {
    return this.taskService.findGroup(id);
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: 'Update an AI task group' })
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateAiTaskGroupDto,
  ) {
    return this.taskService.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  @ApiOperation({ summary: 'Delete an AI task group' })
  async deleteGroup(@Param('id') id: string) {
    await this.taskService.deleteGroup(id);
    return { deleted: true };
  }

  // --- Execution ---

  @Post('execute')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Execute AI tasks on tenders',
    description:
      'Run a set of tasks (by taskIds or groupId) on a set of tenders. ' +
      'Returns execution results with LLM responses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Execution results with status, result text, and usage stats',
  })
  async execute(@Body() dto: ExecuteTasksDto) {
    const tasks = await this.taskService.resolveTasks(
      dto.taskIds,
      dto.groupId,
    );
    return this.executor.executeTasks(dto.tenderIds, tasks);
  }

  @Get('executions/tender/:tenderId')
  @ApiOperation({
    summary: 'Get all AI task execution results for a tender',
  })
  async getExecutionsForTender(@Param('tenderId') tenderId: string) {
    return this.executor.getExecutionsForTender(tenderId);
  }

  @Post('executions/:id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-execute a failed or completed task execution' })
  async retryExecution(@Param('id') id: string) {
    return this.executor.reExecute(id);
  }
}
