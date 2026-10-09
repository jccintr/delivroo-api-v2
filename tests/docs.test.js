import { describe, it, expect } from 'vitest';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'node:fs';
import app from '../app.js';
import { openapi } from '../docs/openapi.js';

describe('documentação', () => {
  it('a especificação OpenAPI é válida', async () => {
    await expect(SwaggerParser.validate(structuredClone(openapi))).resolves.toBeTruthy();
  });

  it('serve /openapi.json e a página /docs', async () => {
    const spec = await request(app).get('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe('Delivroo API v2');
    const page = await request(app).get('/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');
  });

  it('documenta todas as rotas declaradas em routes/*.routes.js', () => {
    const mounts = { 'store.routes.js': '/api/stores', 'public.routes.js': '/api/public', 'city.routes.js': '/api/cities', 'admin.routes.js': '/api/admin' };
    const missing = [];
    for (const [file, prefix] of Object.entries(mounts)) {
      const src = fs.readFileSync(new URL(`../routes/${file}`, import.meta.url), 'utf8');
      for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\('([^']*)'/g)) {
        const path = (prefix + (m[2] === '/' ? '' : m[2])).replace(/:(\w+)/g, '{$1}');
        const alt = path.replace('{slug}', '{slug}');
        if (!openapi.paths[alt]?.[m[1]]) missing.push(`${m[1].toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
