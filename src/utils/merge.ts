export function merge<T>(
  target: T[],
  source: T[],
  chunkSize: number = 10000
): void {
  if (source.length <= chunkSize) {
    Array.prototype.push.apply(target, source);
    return;
  }
  for (let i = 0; i < source.length; i += chunkSize) {
    Array.prototype.push.apply(target, source.slice(i, i + chunkSize));
  }
}
