/**
 * Dev: phục vụ /api/baocaoVandonNvData trực tiếp trong Vite (không cần `npm run server` cổng 3002).
 */
export function viteBaocaoVandonNvApiPlugin(env = {}) {
  return {
    name: 'vite-baocao-vandon-nv-api',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) {
        if (v != null && v !== '' && process.env[k] == null) {
          process.env[k] = v;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const pathOnly = rawUrl.split('?')[0];
        if (
          pathOnly !== '/api/baocaoVandonNvData' &&
          pathOnly !== '/api/baocao-vandon-nv-data'
        ) {
          return next();
        }

        try {
          const { default: handler } = await import('../api/baocaoVandonNvData.js');
          const u = new URL(rawUrl, 'http://127.0.0.1');
          const query = Object.fromEntries(u.searchParams.entries());
          const mockReq = {
            method: (req.method || 'GET').toUpperCase(),
            query,
          };
          const mockRes = {
            statusCode: 200,
            headers: {},
            setHeader(key, value) {
              this.headers[key] = value;
            },
            status(code) {
              this.statusCode = code;
              return this;
            },
            json(body) {
              res.statusCode = this.statusCode;
              for (const [k, v] of Object.entries(this.headers)) {
                res.setHeader(k, v);
              }
              if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
              }
              res.end(JSON.stringify(body));
            },
            end(data) {
              res.statusCode = this.statusCode;
              for (const [k, v] of Object.entries(this.headers)) {
                res.setHeader(k, v);
              }
              res.end(data);
            },
          };

          if (mockReq.method === 'OPTIONS') {
            await handler(mockReq, mockRes);
            return;
          }
          if (mockReq.method !== 'GET') {
            mockRes.status(405).json({ error: 'Method not allowed' });
            return;
          }
          await handler(mockReq, mockRes);
        } catch (e) {
          console.error('[vite] baocaoVandonNvData:', e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: e?.message || 'Server error',
              kind: 'f3',
            })
          );
        }
      });
    },
  };
}
