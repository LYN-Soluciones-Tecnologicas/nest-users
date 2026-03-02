import { Module } from '@nestjs/common';
import { LlmService } from './services/llm.service';
import { LLM_PROVIDER } from './interfaces/ai-provider.interface';

/**
 * AI module providing configurable LLM access.
 *
 * The embedding provider remains in VectorizationModule (already configurable).
 * This module adds the LLM layer needed for:
 * - Smart search profile analysis
 * - AI task execution on saved tenders
 */
@Module({
  providers: [
    LlmService,
    {
      provide: LLM_PROVIDER,
      useExisting: LlmService,
    },
  ],
  exports: [LlmService, LLM_PROVIDER],
})
export class AiModule {}
