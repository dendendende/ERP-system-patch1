-- Fake development data only. Never real customers, accounts, or bank data.

-- Team: one user per role. Local password for all: Local-dev-pass1
-- Each enrols TOTP 2FA on first login. e2e-* users belong to the Playwright tests (they reset
-- their 2FA every run), so the demo users above keep your phone setup.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('Local-dev-pass1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'owner@example.test', 'Olivia Owner'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'operator@example.test', 'Oscar Operator'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'viewer@example.test', 'Vera Viewer'),
  ('00000000-0000-4000-8000-0000000000e1'::uuid, 'e2e-owner@example.test', 'E2E Owner'),
  ('00000000-0000-4000-8000-0000000000e2'::uuid, 'e2e-operator@example.test', 'E2E Operator'),
  ('00000000-0000-4000-8000-0000000000e3'::uuid, 'e2e-viewer@example.test', 'E2E Viewer')
) as u (id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email),
  'email', now(), now()
from auth.users;

update public.users set role = 'owner' where id = '00000000-0000-4000-8000-000000000001';
update public.users set role = 'operator' where id = '00000000-0000-4000-8000-000000000002';
update public.users set role = 'owner' where id = '00000000-0000-4000-8000-0000000000e1';
update public.users set role = 'operator' where id = '00000000-0000-4000-8000-0000000000e2';

-- Bank accounts (fake). Transactions come from the mock adapter / CSV import later.
insert into public.bank_accounts (id, bank_name, account_name, account_last4, source) values
  ('00000000-0000-4000-8000-0000000000b1', 'BCA', 'PT Contoh Operasional', '1234', 'csv'),
  ('00000000-0000-4000-8000-0000000000b2', 'Mandiri', 'PT Contoh Payroll', '5678', 'aggregator');

-- Customers (fake). Names match the mock bank's payers so matching (P2-T4) has real-looking data.
insert into public.customers (id, name, whatsapp_number, billing_email, notes) values
  ('00000000-0000-4000-8000-0000000000c1', 'PT Maju Jaya', '+6281234560001', 'finance@majujaya.example', ''),
  ('00000000-0000-4000-8000-0000000000c2', 'CV Sinar Abadi', '+6281234560002', 'admin@sinarabadi.example', ''),
  ('00000000-0000-4000-8000-0000000000c3', 'PT Karya Digital', '+6281234560003', 'ap@karyadigital.example', 'Pays by the 5th'),
  ('00000000-0000-4000-8000-0000000000c4', 'PT Nusantara Soft', '+6281234560004', 'billing@nusantarasoft.example', ''),
  ('00000000-0000-4000-8000-0000000000c5', 'Toko Berkah', '+6281234560005', null, 'WhatsApp only');

insert into public.subscriptions (customer_id, plan_name, price, cycle, start_date, next_invoice_date, status) values
  ('00000000-0000-4000-8000-0000000000c1', 'Business', 4900000, 'monthly', current_date - 200, current_date + 10, 'active'),
  ('00000000-0000-4000-8000-0000000000c2', 'Starter', 1500000, 'monthly', current_date - 120, current_date + 3, 'active'),
  ('00000000-0000-4000-8000-0000000000c3', 'Growth', 2750000, 'monthly', current_date - 90, current_date + 20, 'active'),
  ('00000000-0000-4000-8000-0000000000c4', 'Growth yearly', 29700000, 'yearly', current_date - 300, current_date + 65, 'active'),
  ('00000000-0000-4000-8000-0000000000c5', 'Starter', 1500000, 'monthly', current_date - 60, current_date + 14, 'paused');
