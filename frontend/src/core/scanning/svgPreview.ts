export function svgPreviewDataUri(svg: string): string {
  const normalized = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
}
