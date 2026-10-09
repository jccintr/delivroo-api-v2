// Linhas do banco (snake_case) -> JSON da API (camelCase). Dinheiro sempre em centavos (*Cents).
export const storeDto = (s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  email: s.email,
  emailVerifiedAt: s.email_verified_at,
  phone: s.phone,
  cityId: s.city_id,
  address: {
    street: s.street, number: s.number, complement: s.complement,
    district: s.district, zipCode: s.zip_code,
    latitude: s.latitude === null ? null : Number(s.latitude),
    longitude: s.longitude === null ? null : Number(s.longitude),
  },
  logoUrl: s.logo_url,
  bgColor: s.bg_color,
  textColor: s.text_color,
  pixKey: s.pix_key,
  pixBeneficiary: s.pix_beneficiary,
  waitMinMinutes: s.wait_min_minutes,
  waitMaxMinutes: s.wait_max_minutes,
  active: !!s.active,
  isOpen: !!s.is_open,
  openedAt: s.opened_at,
  createdAt: s.created_at,
});

export const zoneDto = (z) => ({ id: z.id, district: z.district, feeCents: z.fee_cents, active: !!z.active });

export const paymentMethodDto = (p) => ({ id: p.id, name: p.name, type: p.type, position: p.position, active: !!p.active });

export const categoryDto = (c) => ({ id: c.id, name: c.name, position: c.position, active: !!c.active });

export const hourDto = (h) => ({ id: h.id, weekday: h.weekday, opensAt: h.opens_at, closesAt: h.closes_at });

export const variantDto = (v) => ({
  id: v.id, productId: v.product_id, name: v.name, description: v.description,
  priceCents: v.price_cents, position: v.position, active: !!v.active,
});

export const optionDto = (o, prices = {}) => ({
  id: o.id, groupId: o.group_id, name: o.name, description: o.description, imageUrl: o.image_url,
  priceCents: o.price_cents, isDefault: !!o.is_default, position: o.position, active: !!o.active,
  prices, // { [variantId]: priceCents } — preço por variação (sobrescreve priceCents)
});

export const groupDto = (g, options = []) => ({
  id: g.id, name: g.name, minSelect: g.min_select, maxSelect: g.max_select,
  maxPerOption: g.max_per_option, pricingMode: g.pricing_mode, active: !!g.active, options,
});

// ---- backoffice (admin geral) ----
export const adminDto = (a) => ({
  id: a.id, name: a.name, email: a.email, active: !!a.active, lastLoginAt: a.last_login_at ?? null, createdAt: a.created_at,
});

// Visão da loja para o admin geral: cadastro + situação. Nunca inclui senha; nada do cardápio.
export const adminStoreDto = (s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  email: s.email,
  emailVerifiedAt: s.email_verified_at ?? null,
  phone: s.phone,
  city: { id: s.city_id, name: s.city_name ?? null, state: s.city_state ?? null },
  address: { street: s.street, number: s.number, complement: s.complement, district: s.district, zipCode: s.zip_code },
  logoUrl: s.logo_url,
  active: !!s.active,
  isOpen: !!s.is_open,
  deactivatedAt: s.deactivated_at ?? null,
  deactivationReason: s.deactivation_reason ?? null,
  createdAt: s.created_at,
  ordersCount: Number(s.orders_count ?? 0),
  lastOrderAt: s.last_order_at ?? null,
  billing: {
    status: s.billing_status ?? null,   // TRIALING, ACTIVE, COURTESY, PAST_DUE, SUSPENDED, CANCELED
    coveredThrough: s.billing_covered_through ?? null,
    planName: s.plan_name ?? null,
  },
});
