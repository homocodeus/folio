declare module 'fontkit' {
  export interface Font { hasGlyphForCodePoint(codePoint: number): boolean }
  export function create(buffer: Uint8Array): Font;
}
