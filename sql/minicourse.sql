-- ===== Міні-курс з інтернет-маркетингу (тріпваєр) =====
-- Окрема таблиця від edu_payments/edu_students: це інший продукт, інший бот,
-- інша логіка доступу (7 коротких уроків, не повний курс наставництва).
-- Виконати в Supabase SQL Editor. Idempotent.
create table if not exists mc_payments (
  id uuid primary key default gen_random_uuid(),
  order_ref text unique not null,
  tariff text not null,          -- 'start' | 'standard' | 'max'
  amount numeric not null,
  phone text,
  email text,
  access_code text,
  tg_id text,                    -- заповнюється, коли людина відкриє бота і прив'яже оплату
  used_at timestamptz,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists mc_payments_order_ref_idx on mc_payments(order_ref);
create index if not exists mc_payments_tg_id_idx on mc_payments(tg_id);
