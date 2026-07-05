// Deterministic, rich color per car (seeded by brand/model/plate). Gives every
// vehicle a distinct, recognizable title band instead of a wall of white cards.
// All colors are dark & saturated enough for white text (AA on the band).

const BANDS = [
  '#b23a10', // burnt orange (brand family)
  '#1f6f6b', // teal
  '#3f4c86', // indigo
  '#7a3b69', // plum
  '#4e6b2a', // olive
  '#8a5320', // bronze
  '#7a3030', // brick
  '#2f5c8a', // steel blue
  '#5b4a8a', // violet
  '#0f766e', // pine
  '#9a4a12', // amber-brown
  '#3a5a40', // forest
] as const

export function brandColor(seed: string): string {
  const key = (seed || '').trim().toLowerCase() || 'car'
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return BANDS[h % BANDS.length]
}
