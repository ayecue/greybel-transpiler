export const getStringHashCode = (function () {
  const cache = new Map<string, number>();
  const generateHash = (s: string) => {
    let i, h;
    for (i = 0, h = 0; i < s.length; i++)
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  };

  return (value: string): number => {
    if (value.length === 0) {
      return 0;
    }

    const cachedHash = cache.get(value);

    if (cachedHash !== undefined) {
      return cachedHash;
    }

    const hash = generateHash(value);
    cache.set(value, hash);
    return hash;
  };
})();
