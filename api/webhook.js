import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { PRODUCTS } from './sign.js';

const SECRET = process.env.WFP_SECRET;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY
);

function sign(fields) {
  return crypto.createHmac('md5', SECRET).update(fields.join(';')).digest('hex');
}
function genCode() {
  return 'MC-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
const fmtUA = n => Number(n).toLocaleString('uk-UA');

async function tgSend(chatId, text, extra) {
  if (!process.env.BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  }).catch(() => {});
}

// Синк ліда в Business OS CRM — той самий підхід, що на marketolog-45/webinar/prereg.
// CRM_INTAKE_KEY відсутній → тихо пропускаємо, не блокуємо вебхук.
async function syncToCrm(row, tariff) {
  const key = process.env.CRM_INTAKE_KEY;
  if (!key) return;
  try {
    await fetch('https://vadim-crm.vercel.app/api/intake', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        phone: row.phone, email: row.email,
        source: `Мінікурс — ${tariff}`,
      }),
    });
  } catch (e) { /* CRM-синк не має ламати вебхук */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const d = req.body;

  const signatureFields = [
    d.merchantAccount, d.orderReference, d.amount, d.currency,
    d.authCode, d.cardPan, d.transactionStatus, d.reasonCode,
  ];
  const expected = sign(signatureFields);
  if (expected !== d.merchantSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (d.transactionStatus === 'Approved') {
    const m = /^mc_\d+_(start|standard|max)$/.exec(d.orderReference || '');
    const tariff = m ? m[1] : null;
    const product = tariff ? PRODUCTS[tariff] : null;

    if (product) {
      const { data: existing } = await supabase.from('mc_payments').select('id').eq('order_ref', d.orderReference).maybeSingle();
      if (!existing) {
        const code = genCode();
        const { data: row } = await supabase.from('mc_payments').insert({
          order_ref: d.orderReference, tariff, amount: Number(d.amount),
          phone: d.phone || d.clientPhone || null,
          email: (d.email || d.clientEmail || '').toLowerCase() || null,
          access_code: code,
          raw: { cardPan: d.cardPan || null, name: d.clientName || null },
        }).select().single();

        if (process.env.ADMIN_TG_ID) {
          const who = (d.clientName || '').trim() || d.phone || d.email || '—';
          tgSend(process.env.ADMIN_TG_ID,
            `💰 Мінікурс: нова оплата ${fmtUA(d.amount)} ₴ · ${product.name}\n👤 ${who}\n\nЩе не прив'язана до Telegram — з'явиться, коли людина відкриє бота.`);
        }
        if (row) syncToCrm(row, product.name).catch(() => {});
      }
    } else if (process.env.ADMIN_TG_ID) {
      tgSend(process.env.ADMIN_TG_ID, `⚠️ Мінікурс: оплата ${fmtUA(d.amount)} ₴ по невідомому тарифу (${d.orderReference})`);
    }
  }

  const responseSignature = sign([d.orderReference, 'accept', String(Math.floor(Date.now() / 1000))]);
  return res.json({
    orderReference: d.orderReference, status: 'accept',
    time: Math.floor(Date.now() / 1000), signature: responseSignature,
  });
}
