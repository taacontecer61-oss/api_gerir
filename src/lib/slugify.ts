export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function ensureUniqueSlug(
  base: string,
  existing: Set<string>,
  yearHint?: number,
): string {
  let candidate = base || 'artigo'
  if (!existing.has(candidate)) return candidate

  if (yearHint) {
    candidate = `${base}-${yearHint}`
    if (!existing.has(candidate)) return candidate
  }

  let n = 2
  while (existing.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
