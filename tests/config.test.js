import { describe, it, expect } from 'vitest';
import { api, auth, registerStore } from './factories/helpers.js';

describe('Taxas de entrega por bairro', () => {
  it('CRUD completo', async () => {
    const { token } = await registerStore();
    const created = await api().post('/api/stores/delivery-zones').set(auth(token)).send({ district: 'Centro', feeCents: 500 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ district: 'Centro', feeCents: 500, active: true });

    const patched = await api().patch(`/api/stores/delivery-zones/${created.body.id}`).set(auth(token)).send({ feeCents: 700, active: false });
    expect(patched.body).toMatchObject({ feeCents: 700, active: false });

    const list = await api().get('/api/stores/delivery-zones').set(auth(token));
    expect(list.body).toHaveLength(1);

    expect((await api().delete(`/api/stores/delivery-zones/${created.body.id}`).set(auth(token))).status).toBe(204);
    expect((await api().get('/api/stores/delivery-zones').set(auth(token))).body).toHaveLength(0);
  });

  it('valida valores e recusa bairro repetido', async () => {
    const { token } = await registerStore();
    expect((await api().post('/api/stores/delivery-zones').set(auth(token)).send({ district: 'Centro', feeCents: 5.5 })).status).toBe(400);
    expect((await api().post('/api/stores/delivery-zones').set(auth(token)).send({ district: 'Centro', feeCents: -1 })).status).toBe(400);
    await api().post('/api/stores/delivery-zones').set(auth(token)).send({ district: 'Centro', feeCents: 500 }).expect(201);
    expect((await api().post('/api/stores/delivery-zones').set(auth(token)).send({ district: 'Centro', feeCents: 600 })).status).toBe(409);
  });

  it('uma loja não vê nem altera as taxas de outra', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const zone = (await api().post('/api/stores/delivery-zones').set(auth(a.token)).send({ district: 'Centro', feeCents: 500 })).body;

    expect((await api().get('/api/stores/delivery-zones').set(auth(b.token))).body).toEqual([]);
    expect((await api().patch(`/api/stores/delivery-zones/${zone.id}`).set(auth(b.token)).send({ feeCents: 0 })).status).toBe(404);
    expect((await api().delete(`/api/stores/delivery-zones/${zone.id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().get('/api/stores/delivery-zones').set(auth(a.token))).body[0].feeCents).toBe(500);
  });
});

describe('Formas de pagamento', () => {
  it('nasce com as formas padrão; cria com tipo, valida o tipo, recusa nome repetido e desativa', async () => {
    const { token } = await registerStore();

    const defaults = (await api().get('/api/stores/payment-methods').set(auth(token)).expect(200)).body;
    expect(defaults.map((m) => m.name)).toEqual(expect.arrayContaining(['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito']));
    expect(defaults).toHaveLength(4);
    expect(defaults.find((m) => m.name === 'Dinheiro').type).toBe('CASH');
    expect((await api().post('/api/stores/payment-methods').set(auth(token)).send({ name: 'Dinheiro', type: 'CASH' })).status).toBe(409);

    const cash = await api().post('/api/stores/payment-methods').set(auth(token)).send({ name: 'Vale-refeição', type: 'OTHER' });
    expect(cash.status).toBe(201);
    expect(cash.body.type).toBe('OTHER');

    expect((await api().post('/api/stores/payment-methods').set(auth(token)).send({ name: 'X', type: 'BITCOIN' })).status).toBe(400);

    const off = await api().patch(`/api/stores/payment-methods/${cash.body.id}`).set(auth(token)).send({ active: false });
    expect(off.body.active).toBe(false);
  });
});

describe('Horários de funcionamento', () => {
  it('substitui todos os horários, com mais de um intervalo por dia', async () => {
    const { token } = await registerStore();
    const res = await api().put('/api/stores/me/business-hours').set(auth(token)).send({
      hours: [
        { weekday: 1, opensAt: '11:00', closesAt: '14:00' },
        { weekday: 1, opensAt: '18:00', closesAt: '23:30' },
        { weekday: 6, opensAt: '18:00', closesAt: '02:00' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({ weekday: 1, opensAt: '11:00:00', closesAt: '14:00:00' });

    const replaced = await api().put('/api/stores/me/business-hours').set(auth(token)).send({ hours: [{ weekday: 0, opensAt: '12:00', closesAt: '16:00' }] });
    expect(replaced.body).toHaveLength(1);
    expect((await api().put('/api/stores/me/business-hours').set(auth(token)).send({ hours: [] })).body).toEqual([]);
  });

  it('valida formato e recusa horário repetido', async () => {
    const { token } = await registerStore();
    expect((await api().put('/api/stores/me/business-hours').set(auth(token)).send({ hours: [{ weekday: 9, opensAt: '11:00', closesAt: '14:00' }] })).status).toBe(400);
    expect((await api().put('/api/stores/me/business-hours').set(auth(token)).send({ hours: [{ weekday: 1, opensAt: '25:00', closesAt: '14:00' }] })).status).toBe(400);
    const dup = await api().put('/api/stores/me/business-hours').set(auth(token)).send({
      hours: [{ weekday: 1, opensAt: '11:00', closesAt: '14:00' }, { weekday: 1, opensAt: '11:00', closesAt: '15:00' }],
    });
    expect(dup.status).toBe(422);
  });
});
