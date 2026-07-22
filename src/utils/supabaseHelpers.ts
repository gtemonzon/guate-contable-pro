/**
 * Fetches all records from a Supabase query by automatically handling pagination.
 * This ensures that queries returning more than 1000 records get all data.
 *
 * IMPORTANT: supabase-js's PostgrestTransformBuilder mutates its internal state
 * on `.range()` and returns `this` (not a fresh copy). That means calling
 * `.range()` multiple times on the SAME builder in parallel — before any of the
 * promises resolve — causes every request to end up using the LAST range
 * applied, producing duplicated rows AND missing ranges (holes) in the result.
 *
 * To safely use the parallel fan-out, pass a FACTORY function
 * (`() => supabase.from(...).select(...)...`) as the first argument. The
 * factory is invoked once per range so each HTTP request has its own builder.
 *
 * If a pre-built query object is passed instead, we fall back to the sequential
 * implementation (correct, just slower) to avoid the shared-mutation hazard.
 *
 * @param queryOrFactory - Either a Supabase query builder OR a factory that returns one
 * @param pageSize - Number of records per page (default: 1000)
 * @returns Promise with all records
 */
export async function fetchAllRecords<T>(
  queryOrFactory: any,
  pageSize: number = 1000
): Promise<T[]> {
  const isFactory = typeof queryOrFactory === "function";

  // Safety: without a factory we cannot fan out in parallel without risking
  // shared-state mutation across concurrent requests. Use the sequential path.
  if (!isFactory) {
    return fetchAllRecordsSequential<T>(queryOrFactory, pageSize);
  }

  const makeQuery = queryOrFactory as () => any;

  try {
    const first = await makeQuery().range(0, pageSize - 1);
    if (first.error) throw first.error;

    const firstRows: T[] = (first.data ?? []) as T[];
    if (!firstRows.length) return firstRows;
    if (firstRows.length < pageSize) return firstRows;

    // Parallel "blind" fan-out; stop as soon as any page comes back short.
    // Each range is executed on a FRESH builder instance produced by the
    // factory, so there is no shared mutable state between concurrent requests.
    const PARALLEL_BATCH = 4;
    const all: T[] = firstRows.slice();
    let nextStart = pageSize;
    while (true) {
      const batch = await Promise.all(
        Array.from({ length: PARALLEL_BATCH }, (_, i) => {
          const start = nextStart + i * pageSize;
          return makeQuery().range(start, start + pageSize - 1);
        })
      );

      let stop = false;
      for (const res of batch) {
        if (res.error) throw res.error;
        const rows = (res.data ?? []) as T[];
        all.push(...rows);
        if (rows.length < pageSize) stop = true;
      }
      nextStart += PARALLEL_BATCH * pageSize;
      if (stop) break;
    }
    return all;
  } catch (err) {
    // Fall back to sequential using a fresh builder from the factory.
    return fetchAllRecordsSequential<T>(makeQuery(), pageSize);
  }
}


async function fetchAllRecordsSequential<T>(
  query: any,
  pageSize: number = 1000
): Promise<T[]> {
  let allData: T[] = [];
  let start = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      hasMore = data.length === pageSize;
      start += pageSize;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

/**
 * Fetches records in batches and processes them with a callback.
 * Useful for very large datasets where you want to process data incrementally.
 *
 * @param query - The Supabase query builder
 * @param onBatch - Callback function to process each batch
 * @param pageSize - Number of records per page (default: 1000)
 */
export async function fetchRecordsInBatches<T>(
  query: any,
  onBatch: (batch: T[], batchNumber: number) => void | Promise<void>,
  pageSize: number = 1000
): Promise<void> {
  let start = 0;
  let hasMore = true;
  let batchNumber = 1;

  while (hasMore) {
    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      await onBatch(data, batchNumber);
      hasMore = data.length === pageSize;
      start += pageSize;
      batchNumber++;
    } else {
      hasMore = false;
    }
  }
}
