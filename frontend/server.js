// Minimal Express server used by Scalingo to serve the built Vite SPA.
//
// The frontend is a static single-page app: all routing happens in React
// Router. We therefore serve `dist/` directly and fall back to `index.html`
// for any unmatched path so reloading on /me, /about, /read/:id, etc. doesn't
// 404. Hashed asset filenames make aggressive caching safe; index.html itself
// is forced to no-cache so deploys are picked up immediately.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');

app.use(
  express.static(DIST, {
    maxAge: '1y',
    setHeaders(res, filePath) {
      if (filePath.endsWith(path.sep + 'index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  })
);

// SPA fallback — must come after express.static so real assets still 200.
app.use((_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kind frontend listening on :${PORT}`);
});
