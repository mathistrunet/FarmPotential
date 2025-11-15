const EXTENDED_WINDOWS_1252 = new Map<number, string>([
  [0x80, '€'],
  [0x81, '\u0081'],
  [0x82, '‚'],
  [0x83, 'ƒ'],
  [0x84, '„'],
  [0x85, '…'],
  [0x86, '†'],
  [0x87, '‡'],
  [0x88, 'ˆ'],
  [0x89, '‰'],
  [0x8a, 'Š'],
  [0x8b, '‹'],
  [0x8c, 'Œ'],
  [0x8d, '\u008d'],
  [0x8e, 'Ž'],
  [0x8f, '\u008f'],
  [0x90, '\u0090'],
  [0x91, '‘'],
  [0x92, '’'],
  [0x93, '“'],
  [0x94, '”'],
  [0x95, '•'],
  [0x96, '–'],
  [0x97, '—'],
  [0x98, '˜'],
  [0x99, '™'],
  [0x9a, 'š'],
  [0x9b, '›'],
  [0x9c, 'œ'],
  [0x9d, '\u009d'],
  [0x9e, 'ž'],
  [0x9f, 'Ÿ'],
]);

const EXTENDED_WINDOWS_1252_REVERSE = new Map<string, number>(
  Array.from(EXTENDED_WINDOWS_1252.entries()).map(([code, char]) => [char, code]),
);

function toUint8Array(input: ArrayBuffer | ArrayBufferView | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer);
  }

  return new Uint8Array(input);
}

export function decodeWindows1252(input: ArrayBuffer | ArrayBufferView | Uint8Array): string {
  const bytes = toUint8Array(input);
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte >= 0x80 && byte <= 0x9f) {
      const mapped = EXTENDED_WINDOWS_1252.get(byte);
      result += mapped ?? '\uFFFD';
    } else {
      result += String.fromCharCode(byte);
    }
  }
  return result;
}

export function encodeWindows1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = EXTENDED_WINDOWS_1252_REVERSE.get(char);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    throw new Error(`Character "${char}" cannot be represented in windows-1252 encoding.`);
  }

  return new Uint8Array(bytes);
}
