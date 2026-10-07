import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi } from '../docs/openapi.js';

const router = Router();

router.get('/openapi.json', (req, res) => res.json(openapi));

// Swagger UI em /docs — "Try it out" chama a própria API (servers: "/")
router.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    customSiteTitle: 'Delivroo API v2 — Docs',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, docExpansion: 'list', tagsSorter: 'alpha' },
  }),
);

export default router;
