export function encodeRankingPhoto(canvas: HTMLCanvasElement, quality = 0.9) {
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', quality)
}
