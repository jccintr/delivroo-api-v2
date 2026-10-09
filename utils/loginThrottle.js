// Limite de tentativas de login falhas (em memória, por processo). Serve para o login do admin geral,
// que é o alvo mais valioso. Chave = email: o atacante não consegue chutar senhas à vontade; o custo é que
// ele pode travar o login daquele email por alguns minutos (aceitável: há poucos admins e o travamento expira).
// Em memória significa que reiniciar o servidor zera a contagem e, com várias instâncias, cada uma conta a sua.

export function createLoginThrottle({ maxFailures = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const entries = new Map(); // key -> { failures, lockedUntil, firstAt }

  const prune = (now) => {
    for (const [key, e] of entries) {
      if ((e.lockedUntil ?? 0) <= now && now - e.firstAt > windowMs) entries.delete(key);
    }
  };

  return {
    /** segundos até poder tentar de novo (0 = liberado) */
    blockedFor(key, now = Date.now()) {
      const e = entries.get(key);
      if (!e?.lockedUntil || e.lockedUntil <= now) return 0;
      return Math.ceil((e.lockedUntil - now) / 1000);
    },
    fail(key, now = Date.now()) {
      prune(now);
      let e = entries.get(key);
      if (!e || now - e.firstAt > windowMs) {
        e = { failures: 0, lockedUntil: null, firstAt: now };
        entries.set(key, e);
      }
      e.failures += 1;
      if (e.failures >= maxFailures) e.lockedUntil = now + windowMs;
    },
    reset(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

export const adminLoginThrottle = createLoginThrottle();
