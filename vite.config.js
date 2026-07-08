import { defineConfig } from 'vite';

// base: './' 使用相对路径，部署到腾讯云 EdgeOne Pages 时不会因子路径而 404。
//
// 开发期 /ai 代理插件：把前端对 /ai 的请求转发到腾讯混元 hy3。
// 生产环境由 EdgeOne 边缘函数 functions/ai.js 处理同一路径，前端 AIClient 无需改动。
const HUNYUAN_URL = 'https://tokenhub.tencentmaas.com/v1/chat/completions';
// API key 从环境变量读取,绝不硬编码进仓库。本地开发在 .env 或 shell 设 HUNYUAN_API_KEY。
const HUNYUAN_KEY = process.env.HUNYUAN_API_KEY || '';

function aiDevProxy() {
  return {
    name: 'ai-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/ai', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405; res.end('Method Not Allowed'); return;
        }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', async () => {
          try {
            const { messages, model } = JSON.parse(body || '{}');
            const r = await fetch(HUNYUAN_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + HUNYUAN_KEY,
              },
              body: JSON.stringify({ model: model || 'hy3', messages, stream: false }),
            });
            const data = await r.json();
            const text = data?.choices?.[0]?.message?.content ?? '';
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: !!text, text }));
          } catch (e) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [aiDevProxy()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, open: true },
});
