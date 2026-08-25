/** Browser-safe stub — real implementation uses node:async_hooks on the server. */

export async function runWithStartContext<T>(
  _context: unknown,
  fn: () => T | Promise<T>,
): Promise<T> {
  return fn();
}

export function getStartContext(_opts?: { throwIfNotFound?: boolean }) {
  return undefined;
}
