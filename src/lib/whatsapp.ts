// Build a wa.me deep link. Normalizes Moroccan local numbers (leading 0 → 212).
export function waLink(phone: string | null | undefined, message: string) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `212${digits.slice(1)}`
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(message)}`
}
