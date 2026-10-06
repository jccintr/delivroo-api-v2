import { makeCrud } from '../utils/crud.js';
import { zoneDto, paymentMethodDto } from '../utils/dto.js';

export const zones = makeCrud({
  table: 'delivery_zones',
  label: 'Bairro',
  columns: { district: 'district', feeCents: 'fee_cents', active: 'active' },
  toDto: zoneDto,
  orderBy: ['district'],
});

export const paymentMethods = makeCrud({
  table: 'payment_methods',
  label: 'Forma de pagamento',
  columns: { name: 'name', type: 'type', position: 'position', active: 'active' },
  toDto: paymentMethodDto,
  orderBy: ['position', 'name'],
});
