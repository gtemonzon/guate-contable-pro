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
  let allData: T[] = [];
  let start = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(start, start + pageSize - 1);
    
    if (error) {
      throw error;
    }

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
    
    if (error) {
      throw error;
    }

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
