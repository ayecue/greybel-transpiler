function generateChars(from: number, to: number): string {
  let output = '';
  while (from <= to) {
    output = output + String.fromCharCode(from);
    from = from + 1;
  }
  return output;
}

export interface CharsetMap {
  variables: string;
  modules: string;
}

export function generateCharsetMap(obfuscation: boolean = false): CharsetMap {
  const alphaUpper = generateChars(65, 90);
  const alphaLower = generateChars(97, 122);
  const numbers = generateChars(48, 57);
  let special = '_';

  if (obfuscation) {
    special = special + generateChars(1000, 2000);
  }

  return {
    variables: alphaUpper + alphaLower + special,
    modules: alphaUpper + alphaLower + numbers + special
  };
}
