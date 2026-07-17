import { createClient } from '@supabase/supabase-js';

// Чесна перевірка оплати для сторінки подяки — WFP редіректить незалежно від
// реального результату (напр. відхилений Apple Pay), тож довіряємо лише базі,
// куди пише підписаний вебхук. Той самий підхід, що в marketolog-45/api/paycheck.js.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const txn = String(req.query.txn || '');
  if (!/^mc_\d+_(start|standard|max)$/.test(txn)) return res.status(400).json({ error: 'bad txn' });

  const { data } = await supabase.from('mc_payments').select('tariff').eq('order_ref', txn).maybeSingle();
  return res.json({ found: !!data, tariff: data?.tariff || null });
}
