-- P3-T4a: which language a customer's messages are written in. Indonesian unless told otherwise.

alter table public.customers
  add column language text not null default 'id' check (language in ('id', 'en'));
