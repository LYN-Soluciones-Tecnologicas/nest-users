import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTask } from './entities/ai-task.entity';
import { AiTaskGroup } from './entities/ai-task-group.entity';
import { AiTaskExecution } from './entities/ai-task-execution.entity';
import { Tender } from '../tenders/entities/tender.entity';
import { AiTaskService } from './services/ai-task.service';
import { TaskExecutorService } from './services/task-executor.service';
import { AiTasksController } from './ai-tasks.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiTask, AiTaskGroup, AiTaskExecution, Tender]),
    AiModule,
  ],
  controllers: [AiTasksController],
  providers: [AiTaskService, TaskExecutorService],
  exports: [AiTaskService, TaskExecutorService],
})
export class AiTasksModule {}
