-- Fake development data only. Never real customers, accounts, or bank data.

-- Team: one user per role. Local password for all: Local-dev-pass1
-- Each enrols TOTP 2FA on first login.
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
  ('00000000-0000-4000-8000-000000000003'::uuid, 'viewer@example.test', 'Vera Viewer')
) as u (id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email),
  'email', now(), now()
from auth.users;

update public.users set role = 'owner' where id = '00000000-0000-4000-8000-000000000001';
update public.users set role = 'operator' where id = '00000000-0000-4000-8000-000000000002';
