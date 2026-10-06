import express from 'express';
import cors from 'cors';
import router from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: '*' }));

app.get('/', (req, res) => res.send('DELIVROO API V2'));
app.get('/health', (req, res) => res.send('DELIVROO API V2 is healthy'));

app.use('/api', router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
