import { createClient } from '@supabase/supabase-js';
import { PRODUCTS } from './sign.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY
);

// ===== Уроки міні-курсу =====
// TODO(Вадим): заміни placeholder-посилання на реальні, коли запишеш відео
// (YouTube/Vimeo unlisted чи Google Drive — що зручніше). Тут лише 5 базових
// уроків розблоковуються на "Старт"; "Стандарт"/"Максимум" відкривають усі 7 + бонус.
const LESSONS = [
  { n: 1, title: 'Що таке інтернет-маркетинг і з чого почати', url: '[ПОСИЛАННЯ НА УРОК 1]' },
  { n: 2, title: 'Як знайти свій напрямок', url: '[ПОСИЛАННЯ НА УРОК 2]' },
  { n: 3, title: 'Перші кроки в портфоліо', url: '[ПОСИЛАННЯ НА УРОК 3]' },
  { n: 4, title: 'Де шукати перших клієнтів', url: '[ПОСИЛАННЯ НА УРОК 4]' },
  { n: 5, title: 'Як не боятись першого повідомлення', url: '[ПОСИЛАННЯ НА УРОК 5]' },
  { n: 6, title: 'Як назвати ціну і не злякатись', url: '[ПОСИЛАННЯ НА УРОК 6]' },
  { n: 7, title: 'План виходу на перші $1000', url: '[ПОСИЛАННЯ НА УРОК 7]' },
];

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => ({}));
}

function lessonsText(tariff) {
  const count = PRODUCTS[tariff]?.lessons || 5;
  const lines = LESSONS.slice(0, count).map(l => `${l.n}. ${l.title}\n${l.url}`).join('\n\n');
  let extra = '';
  if (tariff === 'standard' || tariff === 'max') {
    extra += '\n\n🎯 Бонус: план виходу на перші $1000 — [ПОСИЛАННЯ НА БОНУС]';
  }
  if (tariff === 'max') {
    extra += '\n\n💬 У тебе тариф «Максимум» — просто напиши своє питання сюди в чат, Вадим відповість особисто.';
  }
  return `🎉 Дякуємо за оплату! Ось твої уроки:\n\n${lines}${extra}`;
}

async function deliverAccess(chatId, row) {
  await tg('sendMessage', { chat_id: chatId, text: lessonsText(row.tariff) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const update = req.body;

  try {
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();

      if (text.startsWith('/start')) {
        const payload = text.slice(6).trim();

        // Deep-лінк зі сторінки подяки: t.me/<bot>?start=<order_ref>
        if (/^mc_\d+_(start|standard|max)$/.test(payload)) {
          const { data: row } = await db.from('mc_payments').select('*').eq('order_ref', payload).maybeSingle();
          if (!row) {
            await tg('sendMessage', { chat_id: chatId, text: '⏳ Бачу тебе! Оплата ще обробляється — зачекай хвилину і натисни /start ще раз 🙌' });
            return res.json({ ok: true });
          }
          if (!row.used_at) {
            await db.from('mc_payments').update({ tg_id: String(chatId), used_at: new Date().toISOString() }).eq('id', row.id);
          }
          await deliverAccess(chatId, row);
          return res.json({ ok: true });
        }

        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Привіт! 👋 Це бот міні-курсу з інтернет-маркетингу.\n\nЯкщо ти вже оплатив(-ла) — надішли сюди номер телефону, який вказував(-ла) при оплаті, або код доступу (формат MC-XXXXXX), і я одразу відкрию уроки.',
        });
        return res.json({ ok: true });
      }

      // Спроба самостійно "розклеїти" доступ за кодом чи телефоном
      // (fallback для тих, хто прийшов у бота не по прямому лінку з сайту).
      const codeMatch = /^MC-[A-F0-9]{6}$/i.exec(text);
      const digits = text.replace(/\D/g, '');
      if (codeMatch || digits.length >= 9) {
        let query = db.from('mc_payments').select('*').is('tg_id', null).order('created_at', { ascending: false }).limit(1);
        query = codeMatch ? query.eq('access_code', text.toUpperCase()) : query.ilike('phone', `%${digits.slice(-9)}%`);
        const { data: rows } = await query;
        const row = rows?.[0];
        if (row) {
          await db.from('mc_payments').update({ tg_id: String(chatId), used_at: new Date().toISOString() }).eq('id', row.id);
          await deliverAccess(chatId, row);
        } else {
          await tg('sendMessage', { chat_id: chatId, text: 'Не знайшов оплату за цими даними 🤔 Перевір код чи номер, або напиши Вадиму особисто.' });
        }
        return res.json({ ok: true });
      }

      // Будь-яке інше повідомлення від людини з тарифом "Максимум" — форвард адміну,
      // щоб Вадим міг відповісти особисто прямо в цьому чаті (текстова підтримка).
      const { data: buyer } = await db.from('mc_payments').select('*').eq('tg_id', String(chatId)).eq('tariff', 'max').maybeSingle();
      if (buyer && process.env.ADMIN_TG_ID) {
        await tg('sendMessage', {
          chat_id: process.env.ADMIN_TG_ID,
          text: `💬 Питання від покупця «Максимум» (${buyer.phone || buyer.email || buyer.tg_id}):\n\n${text}`,
        });
        await tg('sendMessage', { chat_id: chatId, text: 'Дякую! Передав твоє питання Вадиму — відповість тут особисто 🙌' });
      }
    }
  } catch (e) {
    console.error('[mc bot]', e.message);
  }
  return res.json({ ok: true });
}
