/**
 * Raw tender data from any source, before normalization.
 */
export interface RawTenderData {
  /** External ID from the source */
  externalId: string;
  /** Title of the tender */
  title: string;
  /** Description / object of the contract */
  description?: string;
  /** Contracting authority name */
  contractingAuthority?: string;
  /** CPV codes */
  cpvCodes?: string[];
  /** Budget amount in euros */
  budgetAmount?: number;
  /** Currency (default EUR) */
  currency?: string;
  /** Tender status */
  status?: string;
  /** Submission deadline */
  submissionDeadline?: Date;
  /** Publication date */
  publicationDate?: Date;
  /** Contract type (services, works, supplies) */
  contractType?: string;
  /** Procedure type (open, restricted, etc.) */
  procedureType?: string;
  /** Location / execution place */
  location?: string;
  /** URL to full tender details */
  detailUrl?: string;
  /** URLs to related documents (pliegos, etc.) */
  documentUrls?: string[];
  /** Whether this is a minor contract */
  isMinorContract?: boolean;
  /** Raw data from the source for reference */
  rawData?: Record<string, unknown>;
}

/**
 * Result of a data source fetch operation.
 */
export interface FetchResult {
  tenders: RawTenderData[];
  /** Token/cursor for next page */
  nextPageToken?: string;
  /** Total count if available */
  totalCount?: number;
  /** Whether there are more pages */
  hasMore: boolean;
}

/**
 * Query parameters for fetching tenders from a source.
 */
export interface SourceQuery {
  /** Only fetch tenders updated after this date */
  updatedAfter?: Date;
  /** Page token for pagination */
  pageToken?: string;
  /** Max results per page */
  limit?: number;
  /** Include minor contracts */
  includeMinorContracts?: boolean;
  /** CPV code filter */
  cpvCodes?: string[];
}

/**
 * Interface that all data source adapters must implement.
 * Adding a new source = implementing this interface + registering the module.
 */
export interface IDataSourceAdapter {
  /** Unique identifier for this source */
  readonly sourceId: string;
  /** Human-readable name */
  readonly sourceName: string;
  /** Region/scope (nacional, euskadi, cataluna, galicia) */
  readonly region: string;

  /**
   * Fetch tenders from the source.
   * Supports pagination via SourceQuery.pageToken.
   */
  fetch(query: SourceQuery): Promise<FetchResult>;

  /**
   * Check if the source is available/healthy.
   */
  healthCheck(): Promise<boolean>;
}

/** Injection token for data source adapters */
export const DATA_SOURCE_ADAPTERS = 'DATA_SOURCE_ADAPTERS';
