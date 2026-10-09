// Ponto ÚNICO que decide o que uma loja pode fazer. Hoje só existe o bloqueio manual do admin geral
// (`stores.active`). Quando houver assinatura, o estado de cobrança entra AQUI (ex.: SUSPENDED = painel só
// na tela de pagamento) e quem chama não precisa mudar.

export const STORE_BLOCKED = 'STORE_BLOCKED';

export const ACCESS = Object.freeze({
  FULL: 'FULL',       // tudo liberado
  BLOCKED: 'BLOCKED', // sem login, sem cardápio, sem pedidos
});

/** @param {{ active: boolean|number }} store linha de `stores` (precisa de `active`) */
export function getStoreAccess(store) {
  if (!store || !store.active) return { state: ACCESS.BLOCKED, reason: 'ADMIN_BLOCK' };
  return { state: ACCESS.FULL, reason: null };
}

export const isStoreBlocked = (store) => getStoreAccess(store).state === ACCESS.BLOCKED;
