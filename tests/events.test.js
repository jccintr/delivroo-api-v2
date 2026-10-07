import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app.js';
import { closeAll } from '../services/events.js';
import { api, auth, registerStore, seedPizzaria } from './factories/helpers.js';

let server; let base;
beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { closeAll(); await new Promise((r) => server.close(r)); });

let A;
beforeEach(async () => {
  const reg = await registerStore();
  A = { ...reg, s: await seedPizzaria(reg.token) };
});

/** abre um fluxo SSE e junta os eventos recebidos */
async function openStream(path) {
  const ctl = new AbortController();
  const res = await fetch(base + path, { signal: ctl.signal });
  const out = { res, events: [], raw: '', close: () => ctl.abort() };
  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) return out;
  (async () => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        out.raw += chunk; buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev) out.events.push({ event: ev, data: JSON.parse(data) });
        }
      }
    } catch { /* abortado */ }
  })();
  out.waitFor = async (event, pred = () => true, ms = 3000) => {
    const t0 = Date.now();
    for (;;) {
      const found = out.events.find((e) => e.event === event && pred(e.data));
      if (found) return found.data;
      if (Date.now() - t0 > ms) throw new Error(`timeout esperando "${event}". Recebidos: ${JSON.stringify(out.events.map((e) => e.event))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  return out;
}

const eventsToken = async (token) => (await api().post('/api/stores/events-token').set(auth(token)).expect(200)).body.token;
const openStore = async (token) => openStream(`/api/stores/events?token=${await eventsToken(token)}`);
const placeOrder = async (s, store = A.store) => {
  const res = await api().post(`/api/public/stores/${store.slug}/orders`).send({
    fulfillment: 'PICKUP', name: 'Maria', phone: '(35) 99999-1111', paymentMethodId: s.pix.id,
    items: [{ productId: s.soda.id, variantId: s.soda.variants[0].id, quantity: 1 }],
  });
  expect(res.status).toBe(201);
  return res.body;
};

describe('SSE da loja: autenticação', () => {
  it('o token de eventos exige login', async () => {
    expect((await api().post('/api/stores/events-token')).status).toBe(401);
  });

  it('o fluxo recusa conexão sem token, com token inválido e com o JWT de login', async () => {
    for (const q of ['', '?token=abc', `?token=${A.token}`]) {
      const s = await openStream(`/api/stores/events${q}`);
      expect(s.res.status).toBe(401);
      s.close();
    }
  });

  it('o token de eventos não vale como login nas rotas normais', async () => {
    const t = await eventsToken(A.token);
    expect((await api().get('/api/stores/me').set(auth(t))).status).toBe(401);
  });

  it('abre o fluxo com os cabeçalhos certos, envia "ready" e heartbeat', async () => {
    const s = await openStore(A.token);
    expect(s.res.status).toBe(200);
    expect(s.res.headers.get('content-type')).toContain('text/event-stream');
    expect(s.res.headers.get('cache-control')).toContain('no-cache');
    expect(s.res.headers.get('x-accel-buffering')).toBe('no');
    await s.waitFor('ready');
    await new Promise((r) => setTimeout(r, 400));
    expect(s.raw).toContain(': ping');
    s.close();
  });

  it('limita conexões simultâneas por loja (429)', async () => {
    const open = [];
    for (let i = 0; i < 3; i += 1) open.push(await openStore(A.token));
    const extra = await openStore(A.token);
    expect(extra.res.status).toBe(429);
    [...open, extra].forEach((s) => s.close());
  });
});

describe('SSE da loja: eventos de pedido', () => {
  it('avisa a loja quando um cliente faz um pedido novo', async () => {
    const s = await openStore(A.token);
    await s.waitFor('ready');
    const order = await placeOrder(A.s);
    const ev = await s.waitFor('order.created', (d) => d.order.id === order.id);
    expect(ev.order).toMatchObject({ status: 'RECEIVED', orderNumber: 1, customer: { name: 'Maria' } });
    s.close();
  });

  it('avisa a loja (todos os aparelhos) quando o status muda', async () => {
    const order = await placeOrder(A.s);
    const s = await openStore(A.token);
    await s.waitFor('ready');
    await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);
    const ev = await s.waitFor('order.updated', (d) => d.order.id === order.id);
    expect(ev.order.status).toBe('PREPARING');
    expect(ev.order.history.map((h) => h.status)).toEqual(['RECEIVED', 'PREPARING']);
    s.close();
  });

  it('uma loja não recebe eventos de outra loja', async () => {
    const B = await registerStore();
    B.s = await seedPizzaria(B.token);
    const sB = await openStore(B.token);
    const sA = await openStore(A.token);
    await Promise.all([sA.waitFor('ready'), sB.waitFor('ready')]);

    const order = await placeOrder(A.s);
    await sA.waitFor('order.created', (d) => d.order.id === order.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(sB.events.filter((e) => e.event.startsWith('order.'))).toEqual([]);
    sA.close(); sB.close();
  });
});

describe('SSE do cliente: acompanhamento do pedido', () => {
  it('pedido inexistente responde 404 (JSON, sem abrir fluxo)', async () => {
    const s = await openStream('/api/public/orders/00000000-0000-0000-0000-000000000000/events');
    expect(s.res.status).toBe(404);
    s.close();
  });

  it('manda o estado atual ao conectar e cada mudança de status, sem expor o telefone', async () => {
    const order = await placeOrder(A.s);
    const s = await openStream(`/api/public/orders/${order.publicId}/events`);
    expect(s.res.status).toBe(200);
    const first = await s.waitFor('order.updated');
    expect(first).toMatchObject({ publicId: order.publicId, status: 'RECEIVED', store: { slug: A.store.slug } });
    expect(first.customer).toEqual({ name: 'Maria' });

    await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);
    const up = await s.waitFor('order.updated', (d) => d.status === 'PREPARING');
    expect(up.customer).toEqual({ name: 'Maria' });
    expect(JSON.stringify(up)).not.toContain('991111');

    await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'CANCELED', reason: 'Sem estoque' }).expect(200);
    const last = await s.waitFor('order.updated', (d) => d.status === 'CANCELED');
    expect(last.history.at(-1)).toMatchObject({ status: 'CANCELED', reason: 'Sem estoque' });
    s.close();
  });

  it('quem reconecta recebe o estado mais recente (não perde atualizações)', async () => {
    const order = await placeOrder(A.s);
    await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);
    const s = await openStream(`/api/public/orders/${order.publicId}/events`);
    expect((await s.waitFor('order.updated')).status).toBe('PREPARING');
    s.close();
  });

  it('um pedido não recebe eventos de outro pedido', async () => {
    const o1 = await placeOrder(A.s); const o2 = await placeOrder(A.s);
    const s = await openStream(`/api/public/orders/${o1.publicId}/events`);
    await s.waitFor('order.updated');
    await api().post(`/api/stores/orders/${o2.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);
    await new Promise((r) => setTimeout(r, 250));
    expect(s.events.filter((e) => e.event === 'order.updated')).toHaveLength(1); // só o snapshot inicial
    s.close();
  });
});
