import db from '../db/knex.js';

// Registra uma ação do admin geral. Passe a transação (`trx`) para a ação e o log entrarem juntos:
// se a ação falhar, não sobra log "fantasma"; se o log falhar, a ação é desfeita.
export async function logAdminAction({ adminId, action, storeId = null, details = null }, executor = db) {
  await executor('admin_audit_log').insert({
    admin_id: adminId,
    store_id: storeId,
    action,
    details: details === null ? null : JSON.stringify(details),
  });
}

// MySQL devolve JSON já convertido; MariaDB devolve texto. Aceita os dois.
export function parseDetails(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}
