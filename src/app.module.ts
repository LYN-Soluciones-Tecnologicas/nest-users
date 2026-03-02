import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { getDatabaseConfig } from './config/database.config';
import { SourcesModule } from './sources/sources.module';
import { TendersModule } from './tenders/tenders.module';
import { BoardModule } from './board/board.module';
import { CompanyModule } from './company/company.module';
import { VectorizationModule } from './vectorization/vectorization.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // Redis queues
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
        },
      }),
    }),

    // Cron scheduler
    ScheduleModule.forRoot(),

    // Feature modules
    SourcesModule,
    TendersModule,
    BoardModule,
    CompanyModule,
    VectorizationModule,
    JobsModule,
  ],
})
export class AppModule {}
