// Tempo real via SSE (Server-Sent Events). Hub em memória: canal -> conexões abertas.
//   store:<storeId>      painel da loja (order.created, order.updated)
//   order:<publicId>     acompanhamento do cliente (order.updated)
// Com mais de uma instância da API, troque este módulo por um barramento (ex.: Redis pub/sub) mantendo a mesma interface.

const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS) || 25_000; // comentário ":ping" mantém proxies/balanceadores de conexão aberta
const RETRY_MS = 3_000; // quanto o navegador espera antes de reconectar sozinho
const MAX_PER_CHANNEL = Number(process.env.SSE_MAX_PER_CHANNEL) || 20;

const channels = new Map(); // canal -> Set<{ res, timer }>

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;

export const storeChannel = (storeId) => `store:${storeId}`;
export const orderChannel = (publicId) => `order:${publicId}`;

export function subscriberCount(channel) {
  return channels.get(channel)?.size ?? 0;
}
export const hasSubscribers = (channel) => subscriberCount(channel) > 0;

/**
 * Abre o fluxo SSE para `res` no `channel`. Devolve false (sem tocar na resposta) se o canal já está cheio.
 * `initial` = [{ event, data }] enviados logo após o "ready".
 */
export function subscribe(channel, req, res, initial = []) {
  if (subscriberCount(channel) >= MAX_PER_CHANNEL) return false;

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: não acumular a resposta
  });
  res.flushHeaders();
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  res.write(`retry: ${RETRY_MS}\n\n`);
  res.write(frame('ready', { at: new Date().toISOString() }));
  for (const e of initial) res.write(frame(e.event, e.data));

  const conn = { res, timer: null };
  conn.timer = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  conn.timer.unref?.();

  let set = channels.get(channel);
  if (!set) channels.set(channel, (set = new Set()));
  set.add(conn);

  const cleanup = () => {
    clearInterval(conn.timer);
    set.delete(conn);
    if (set.size === 0 && channels.get(channel) === set) channels.delete(channel);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
  return true;
}

/** envia o evento a todos os assinantes do canal (erros de uma conexão não afetam as outras) */
export function publish(channel, event, data) {
  const set = channels.get(channel);
  if (!set?.size) return 0;
  const chunk = frame(event, data);
  let sent = 0;
  for (const { res } of set) {
    try { res.write(chunk); sent += 1; } catch { /* a conexão será removida no "close" */ }
  }
  return sent;
}

/** encerra todos os fluxos (desligamento da API e testes) */
export function closeAll() {
  for (const set of channels.values()) for (const { res, timer } of set) { clearInterval(timer); try { res.end(); } catch { /* ignora */ } }
  channels.clear();
}
