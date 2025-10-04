import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Weather analysis API listening on port ${port}`);
});
