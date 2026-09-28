/**
 * Runs async task factories with at most `limit` in flight, preserving order.
 * Keeps a single request from monopolising the shared pg pool.
 */
export async function runLimited(tasks, limit = 5) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
