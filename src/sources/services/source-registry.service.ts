import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  IDataSourceAdapter,
  DATA_SOURCE_ADAPTERS,
} from '../../common/interfaces/data-source.interface';

/**
 * Registry that manages all registered data source adapters.
 * New sources auto-register via DI — no code changes needed here.
 */
@Injectable()
export class SourceRegistryService {
  private readonly logger = new Logger(SourceRegistryService.name);
  private readonly adapters = new Map<string, IDataSourceAdapter>();

  constructor(
    @Optional()
    @Inject(DATA_SOURCE_ADAPTERS)
    adapters: IDataSourceAdapter[] = [],
  ) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  private register(adapter: IDataSourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter);
    this.logger.log(
      `Registered data source: ${adapter.sourceName} [${adapter.sourceId}] (${adapter.region})`,
    );
  }

  getAdapter(sourceId: string): IDataSourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  getAllAdapters(): IDataSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdaptersByRegion(region: string): IDataSourceAdapter[] {
    return this.getAllAdapters().filter((a) => a.region === region);
  }

  getSourceIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}
