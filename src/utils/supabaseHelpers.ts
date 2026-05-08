/**
 * Fetches all records from a Supabase query by automatically handling pagination.
 * This ensures that queries returning more than 1000 records get all data.
 *
 * @param query - The Supabase query builder
 * @param pageSize - Number of records per page (default: 1000)
 * @returns Promise with all records
 */
export async function fetchAllRecords<T>(
  query: any,
  pageSize: number = 1000
): Promise<T[]> {
  // Fast path: try the first page WITH an exact count so we can fan out the
  // remaining pages in parallel instead of fetching them sequentially.
  //
  // Why this matters:
  //   sequential 5-page fetch ≈ 5 × RTT
  //   parallel   5-page fetch ≈ 1 × RTT  (after the initial counted fetch)
  try {
    const counted = (typeof query.range === "function" && typeof query.select !== "function")
      ? null
      : null;

    // We only need the head count when the caller hasn't already requested one.
    // Build a parallel-fetch path using `range`. The initial page is fetched
    // separately so we can read `count`.
    const first = await query.range(0, pageSize - 1);
    if (first.error) throw first.error;

    const firstRows: T[] = (first.data ?? []) as T[];
    if (!firstRows.length) return firstRows;

    // If the first page didn't fill the page size, we already have everything.
    if (firstRows.length < pageSize) return firstRows;

    // The supabase-js builder allows chaining `range` again to get further
    // pages. We don't reliably have an exact count here (the caller controls
    // the head/exact options), so we fall back to a parallel "blind" fan-out
    // capped by an exponential probe to avoid overshooting badly.
    //
    // Strategy: fetch the next 4 pages in parallel; if any returns less than
    // pageSize, we stop. Otherwise fetch the next 4, etc. This caps the worst
    // case at ⌈N / (4·pageSize)⌉ round-trips instead of ⌈N / pageSize⌉.
    const PARALLEL_BATCH = 4;
    const all: T[] = firstRows.slice();
    let nextStart = pageSize;
    while (true) {
      const batch = await Promise.all(
        Array.from({ length: PARALLEL_BATCH }, (_, i) => {
          const start = nextStart + i * pageSize;
          return query.range(start, start + pageSize - 1);
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
    // Fall back to the original sequential implementation on any unexpected
    // error so behaviour is never worse than before.
    return fetchAllRecordsSequential<T>(query, pageSize);
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
