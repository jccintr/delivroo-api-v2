import crypto from 'node:crypto';

export const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'loja';

// slug único para a loja: "pizzaria-do-beto", "pizzaria-do-beto-2", ...
export async function uniqueStoreSlug(db, name) {
  const base = slugify(name);
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await db('stores').where({ slug: candidate }).first('id');
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}
