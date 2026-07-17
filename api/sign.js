import crypto from 'crypto';

const MERCHANT = process.env.WFP_MERCHANT;
const SECRET   = process.env.WFP_SECRET;
const DOMAIN   = 'vadim-minicourse.vercel.app';

// Єдине джерело правди про тарифи — webhook.js бере звідси PACKAGE_BY_AMOUNT,
// бот бере звідси кількість уроків.
export const PRODUCTS = {
  start:    { name: 'Міні-курс з інтернет-маркетингу — Базовий',  price: 149, currency: 'UAH', lessons: 5 },
  standard: { name: 'Міні-курс з інтернет-маркетингу — Стандарт', price: 249, currency: 'UAH', lessons: 7 },
  max:      { name: 'Міні-курс з інтернет-маркетингу — Максимум', price: 549, currency: 'UAH', lessons: 7 },
};

function sign(fields) {
  return crypto.createHmac('md5', SECRET).update(fields.join(';')).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { pkg } = req.query;
  const product = PRODUCTS[pkg];
  if (!product) return res.status(400).json({ error: 'Unknown package' });

  const orderDate = Math.floor(Date.now() / 1000);
  // 6 випадкових цифр — orderReference не можна вгадати перебором (він же публічний
  // токен дип-лінка бота bron_<orderReference>, як і в marketolog-45).
  const rand = crypto.randomInt(100000, 1000000);
  const orderReference = `mc_${orderDate}${rand}_${pkg}`;

  const signatureFields = [
    MERCHANT, DOMAIN, orderReference, String(orderDate),
    String(product.price), product.currency, product.name, '1', String(product.price),
  ];
  const merchantSignature = sign(signatureFields);

  res.json({
    merchantAccount: MERCHANT,
    merchantDomainName: DOMAIN,
    orderReference, orderDate,
    amount: product.price,
    currency: product.currency,
    productName: [product.name],
    productCount: [1],
    productPrice: [product.price],
    merchantSignature,
  });
}
