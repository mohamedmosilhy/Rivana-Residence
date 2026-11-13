export interface CacheInvalidator {
  invalidate(tags: readonly string[]): Promise<void>;
}
