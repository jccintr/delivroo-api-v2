// Erro de regra de negócio com status HTTP; o handler global transforma em JSON.
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} não encontrado(a).`);
