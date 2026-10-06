// Cálculo de preço NO SERVIDOR. O cliente envia só ids e quantidades; nunca valores.
// Função pura (sem banco): o controller carrega variante + grupos do produto e chama priceItem().

export class PricingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PricingError';
    this.code = code; // vira HTTP 422 no controller
  }
}

/**
 * @param {object} p
 * @param {{id:number,name:string,priceCents:number,active:boolean}} p.variant   variação escolhida (do produto)
 * @param {Array}  p.groups      grupos ligados ao produto, cada um com options[]:
 *   { id, name, minSelect, maxSelect, maxPerOption, pricingMode:'ADDITIVE'|'HIGHEST', active,
 *     options:[{ id, name, priceCents, active, variantPrices?: { [variantId]: cents } }] }
 * @param {Array<{groupId:number, optionId:number, quantity?:number}>} p.selections
 * @param {number} p.quantity   quantidade do item (>= 1)
 */
export function priceItem({ variant, groups, selections = [], quantity = 1 }) {
  if (!variant || !variant.active) throw new PricingError('VARIANT_UNAVAILABLE', 'Variação indisponível.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new PricingError('INVALID_QUANTITY', 'Quantidade inválida.');
  }

  const activeGroups = groups.filter((g) => g.active);
  const groupById = new Map(activeGroups.map((g) => [g.id, g]));

  // 1) agrupa as escolhas por grupo, juntando repetições da mesma opção
  const picked = new Map(); // groupId -> Map(optionId -> quantity)
  for (const s of selections) {
    const group = groupById.get(s.groupId);
    if (!group) throw new PricingError('GROUP_NOT_ALLOWED', 'Grupo de opções não pertence a este produto.');
    const option = group.options.find((o) => o.id === s.optionId);
    if (!option || !option.active) throw new PricingError('OPTION_UNAVAILABLE', `Opção indisponível em "${group.name}".`);
    const qty = s.quantity ?? 1;
    if (!Number.isInteger(qty) || qty < 1) throw new PricingError('INVALID_QUANTITY', 'Quantidade de opção inválida.');
    const byOption = picked.get(group.id) ?? new Map();
    byOption.set(option.id, (byOption.get(option.id) ?? 0) + qty);
    picked.set(group.id, byOption);
  }

  // 2) valida min/max e calcula o que cada grupo cobra
  const lines = [];
  let optionsTotal = 0;
  let position = 0;

  for (const group of activeGroups) {
    const byOption = picked.get(group.id) ?? new Map();
    const total = [...byOption.values()].reduce((a, b) => a + b, 0);

    if (total < group.minSelect) {
      throw new PricingError('GROUP_MIN', `Escolha pelo menos ${group.minSelect} em "${group.name}".`);
    }
    if (total > group.maxSelect) {
      throw new PricingError('GROUP_MAX', `Escolha no máximo ${group.maxSelect} em "${group.name}".`);
    }

    const entries = [...byOption.entries()].map(([optionId, qty]) => {
      const option = group.options.find((o) => o.id === optionId);
      if (qty > group.maxPerOption) {
        throw new PricingError('OPTION_MAX', `"${option.name}" pode ser escolhida no máximo ${group.maxPerOption}x.`);
      }
      const list = option.variantPrices?.[variant.id] ?? option.priceCents; // preço por tamanho, senão o padrão
      return { group, option, qty, list };
    });

    let highestIndex = -1;
    if (group.pricingMode === 'HIGHEST') {
      let best = -1;
      entries.forEach((e, i) => {
        if (e.list > best) { best = e.list; highestIndex = i; }
      });
    }

    entries.forEach((e, i) => {
      const charged = group.pricingMode === 'HIGHEST' ? (i === highestIndex ? e.list : 0) : e.list * e.qty;
      optionsTotal += charged;
      lines.push({
        groupId: group.id,
        optionId: e.option.id,
        groupName: group.name,
        optionName: e.option.name,
        quantity: e.qty,
        listPriceCents: e.list,
        chargedCents: charged,
        position: position++,
      });
    });
  }

  return {
    unitPriceCents: variant.priceCents,
    optionsTotalCents: optionsTotal,
    quantity,
    lineTotalCents: (variant.priceCents + optionsTotal) * quantity,
    options: lines,
  };
}

/** Total do pedido a partir dos itens já precificados. */
export function priceOrder({ items, deliveryFeeCents = 0, discountCents = 0 }) {
  const subtotal = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  if (discountCents > subtotal + deliveryFeeCents) throw new PricingError('INVALID_DISCOUNT', 'Desconto maior que o pedido.');
  return {
    subtotalCents: subtotal,
    deliveryFeeCents,
    discountCents,
    totalCents: subtotal + deliveryFeeCents - discountCents,
  };
}
