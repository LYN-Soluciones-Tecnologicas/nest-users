import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import {
  ILlmProvider,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../interfaces/ai-provider.interface';

/**
 * Configurable LLM service supporting multiple providers.
 *
 * Supported providers:
 * - 'openai': OpenAI API (GPT-4o, GPT-4o-mini, etc.)
 * - 'anthropic': Anthropic API (Claude)
 * - 'ollama': Local Ollama instance (Llama, Mistral, etc.)
 *
 * Provider and model are configurable via environment variables:
 * - LLM_PROVIDER: 'openai' | 'anthropic' | 'ollama'
 * - LLM_MODEL: model name (e.g. 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'llama3')
 * - LLM_API_KEY: API key (not needed for ollama)
 * - LLM_BASE_URL: Custom base URL (required for ollama, optional for others)
 */
@Injectable()
export class LlmService implements ILlmProvider {
  private readonly logger = new Logger(LlmService.name);
  readonly providerId: string;

  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.providerId = this.config.get<string>('ai.llmProvider') || 'openai';
    this.model = this.config.get<string>('ai.llmModel') || 'gpt-4o-mini';
    this.apiKey = this.config.get<string>('ai.llmApiKey') || '';
    this.baseUrl = this.config.get<string>('ai.llmBaseUrl') || '';

    this.logger.log(
      `LLM provider: ${this.providerId}, model: ${this.model}`,
    );
  }

  async complete(options: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = options.model || this.model;

    switch (this.providerId) {
      case 'anthropic':
        return this.completeAnthropic(options, model);
      case 'ollama':
        return this.completeOllama(options, model);
      case 'openai':
      default:
        return this.completeOpenAI(options, model);
    }
  }

  private async completeOpenAI(
    options: LlmCompletionRequest,
    model: string,
  ): Promise<LlmCompletionResponse> {
    const messages: any[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const payload = JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature ?? 0.3,
    });

    const hostname = this.baseUrl
      ? new URL(this.baseUrl).hostname
      : 'api.openai.com';
    const basePath = this.baseUrl
      ? new URL(this.baseUrl).pathname.replace(/\/$/, '')
      : '';

    const body = await this.httpsRequest({
      hostname,
      path: `${basePath}/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    }, payload);

    const json = JSON.parse(body);
    return {
      text: json.choices[0].message.content,
      model: json.model,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
    };
  }

  private async completeAnthropic(
    options: LlmCompletionRequest,
    model: string,
  ): Promise<LlmCompletionResponse> {
    const payload = JSON.stringify({
      model,
      max_tokens: options.maxTokens || 2000,
      system: options.systemPrompt || '',
      messages: [{ role: 'user', content: options.prompt }],
    });

    const body = await this.httpsRequest({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, payload);

    const json = JSON.parse(body);
    const text = json.content
      ?.map((c: any) => c.text)
      .join('') || '';

    return {
      text,
      model: json.model,
      usage: json.usage
        ? {
            promptTokens: json.usage.input_tokens,
            completionTokens: json.usage.output_tokens,
            totalTokens:
              json.usage.input_tokens + json.usage.output_tokens,
          }
        : undefined,
    };
  }

  private async completeOllama(
    options: LlmCompletionRequest,
    model: string,
  ): Promise<LlmCompletionResponse> {
    const ollamaUrl = this.baseUrl || 'http://localhost:11434';
    const url = new URL(ollamaUrl);

    const messages: any[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const payload = JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens || 2000,
      },
    });

    const body = await this.httpRequest({
      hostname: url.hostname,
      port: parseInt(url.port) || 11434,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, payload);

    const json = JSON.parse(body);
    return {
      text: json.message?.content || '',
      model: json.model || model,
    };
  }

  private httpsRequest(
    options: https.RequestOptions,
    payload: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
          } else {
            resolve(body);
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  private httpRequest(
    options: http.RequestOptions,
    payload: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
          } else {
            resolve(body);
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}
