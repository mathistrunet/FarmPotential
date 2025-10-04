import express from 'express';
import weatherRouter from './weather/controller.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/weather', weatherRouter);

  return app;
}

export default createApp;
