/**
 * EdgeOne Pages 边缘函数 — 代理腾讯混元 hy3 API
 * 路由：POST https://<域名>/ai   （functions/ai.js → /ai）
 *
 * EdgeOne Pages Functions 规范：导出 onRequest(context)，
 * 环境变量从 context.env 读取（控制台 → 项目 → 环境变量 配 HUNYUAN_API_KEY）。
 * Key 只存在于边缘，绝不下发前端。
 */

const HUNYUAN_URL = 'https://tokenhub.tencentmaas.com/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { messages, model } = await request.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ ok: false, error: 'messages required' });
    }

    const apiKey = (env && (env.HUNYUAN_API_KEY || env.DEEPSEEK_API_KEY)) || '';
    if (!apiKey) {
      return json({ ok: false, error: 'API key not configured. Set HUNYUAN_API_KEY in EdgeOne console.' });
    }

    const upstream = await fetch(HUNYUAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: model || 'hy3', messages, stream: false }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return json({ ok: false, error: `Upstream ${upstream.status}: ${errText.slice(0, 200)}` });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content || '';
    return json({ ok: !!text, text });
  } catch (err) {
    return json({ ok: false, error: (err && err.message) || 'Unknown error' });
  }
}
