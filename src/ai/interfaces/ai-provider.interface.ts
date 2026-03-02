/**
 * Interface for LLM providers.
 * Implementations can wrap OpenAI, Anthropic, Ollama, etc.
 */
export interface ILlmProvider {
  /** Unique provider identifier */
  readonly providerId: string;

  /**
   * Send a prompt to the LLM and get a text completion.
   */
  complete(options: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

export interface LlmCompletionRequest {
  /** System prompt (role/behavior instructions) */
  systemPrompt?: string;
  /** User prompt */
  prompt: string;
  /** Model override (provider-specific model name) */
  model?: string;
  /** Max tokens in the response */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
}

export interface LlmCompletionResponse {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Interface for embedding providers.
 * Implementations can wrap Jina, OpenAI, local models, etc.
 */
export interface IEmbeddingProvider {
  /** Unique provider identifier */
  readonly providerId: string;

  /**
   * Generate embedding vector for a text.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch).
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Dimension of the embedding vectors */
  getDimension(): number;
}

/** Injection tokens */
export const LLM_PROVIDER = 'LLM_PROVIDER';
export const EMBEDDING_PROVIDER = 'EMBEDDING_PROVIDER';
