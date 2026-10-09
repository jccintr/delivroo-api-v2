import db from '../db/knex.js';
import { notFound } from '../utils/errors.js';
import { assertMenuAvailable } from './menuAvailability.js';

// Cardápio público da loja: tudo que o cliente precisa numa chamada.
// Preço das opções já vem resolvido POR VARIAÇÃO (prices: { [variantId]: centavos }).
export async function buildMenu(slug) {
  const store = await db('stores as s')
    .leftJoin('cities as c', 'c.id', 's.city_id')
    .where('s.slug', slug)
    .first('s.*', 'c.name as city_name', 'c.state as city_state');
  if (!store) throw notFound('Loja');
  await assertMenuAvailable(store);

  const storeId = store.id;
  const [hours, zones, payments, categories, products] = await Promise.all([
    db('business_hours').where({ store_id: storeId }).orderBy(['weekday', 'opens_at']),
    db('delivery_zones').where({ store_id: storeId, active: true }).orderBy('district'),
    db('payment_methods').where({ store_id: storeId, active: true }).orderBy(['position', 'name']),
    db('categories').where({ store_id: storeId, active: true }).orderBy(['position', 'name']),
    db('products').where({ store_id: storeId, active: true }).orderBy(['position', 'id']),
  ]);

  const productIds = products.map((p) => p.id);
  const variants = productIds.length
    ? await db('product_variants').whereIn('product_id', productIds).where({ active: true }).orderBy(['position', 'id'])
    : [];
  const links = productIds.length
    ? await db('product_option_groups as l')
        .join('option_groups as g', 'g.id', 'l.group_id')
        .whereIn('l.product_id', productIds)
        .where('g.active', true)
        .orderBy(['l.position', 'g.id'])
        .select('l.product_id', 'l.position as link_position', 'g.*')
    : [];

  const groupIds = [...new Set(links.map((l) => l.id))];
  const options = groupIds.length
    ? await db('options').whereIn('group_id', groupIds).where({ active: true }).orderBy(['position', 'id'])
    : [];
  const prices = options.length
    ? await db('option_variant_prices').whereIn('option_id', options.map((o) => o.id))
    : [];
  const priceByOptionVariant = new Map(prices.map((p) => [`${p.option_id}:${p.variant_id}`, p.price_cents]));

  const menuProducts = products.map((p) => {
    const pv = variants.filter((v) => v.product_id === p.id);
    const optionGroups = links
      .filter((l) => l.product_id === p.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.min_select,
        maxSelect: g.max_select,
        maxPerOption: g.max_per_option,
        pricingMode: g.pricing_mode,
        options: options
          .filter((o) => o.group_id === g.id)
          .map((o) => ({
            id: o.id,
            name: o.name,
            description: o.description,
            imageUrl: o.image_url,
            isDefault: !!o.is_default,
            prices: Object.fromEntries(
              pv.map((v) => [v.id, priceByOptionVariant.get(`${o.id}:${v.id}`) ?? o.price_cents]),
            ),
          })),
      }));

    return {
      id: p.id,
      categoryId: p.category_id,
      name: p.name,
      description: p.description,
      imageUrl: p.image_url,
      variants: pv.map((v) => ({ id: v.id, name: v.name, description: v.description, priceCents: v.price_cents })),
      optionGroups,
    };
  }).filter((p) => p.variants.length > 0); // produto sem variação ativa não é vendável

  return {
    store: {
      slug: store.slug,
      name: store.name,
      phone: store.phone,
      logoUrl: store.logo_url,
      bgColor: store.bg_color,
      textColor: store.text_color,
      isOpen: !!store.is_open,
      waitMinMinutes: store.wait_min_minutes,
      waitMaxMinutes: store.wait_max_minutes,
      pixKey: store.pix_key,
      pixBeneficiary: store.pix_beneficiary,
      address: { street: store.street, number: store.number, complement: store.complement, district: store.district },
      city: store.city_name,
      state: store.city_state,
    },
    businessHours: hours.map((h) => ({ weekday: h.weekday, opensAt: h.opens_at, closesAt: h.closes_at })),
    deliveryZones: zones.map((z) => ({ id: z.id, district: z.district, feeCents: z.fee_cents })),
    paymentMethods: payments.map((m) => ({ id: m.id, name: m.name, type: m.type })),
    categories: categories
      .map((c) => ({ id: c.id, name: c.name, products: menuProducts.filter((p) => p.categoryId === c.id) }))
      .filter((c) => c.products.length > 0),
  };
}
