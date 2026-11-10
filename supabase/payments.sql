-- Payments tables for a Shipyard app. NOT a migration yet: when the owner
-- wants payments, copy this file into supabase/migrations as a new migration
-- (npx supabase migration new payments, then paste it in), and deploy.
--
-- Who paid for what, written only by stripe_record_event below, from
-- Stripe's own signed events. The function checks Stripe's signature itself
-- against the signing secrets Shipyard put in this database's Vault
-- (stripe_test_webhook_secret, stripe_live_webhook_secret), so the app needs
-- no Supabase secret key: the webhook route calls it with the publishable
-- key, and an event nobody signed is refused.
--
-- Each signed-in user reads only their own rows. Nobody writes them through
-- the API: there are no insert, update, or delete policies.
--
-- livemode says which Stripe mode a row came from. The app counts only rows
-- of its current mode, so test payments never unlock anything once it is live.

create schema if not exists payments_private;
revoke all on schema payments_private from public, anon, authenticated;

-- Stripe's events already recorded (each is applied once).
create table payments_private.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null,
  received_at timestamptz not null default now()
);

-- A refund that arrived before its payment (Stripe does not promise the
-- order), applied when the payment is recorded.
create table payments_private.stripe_refunds (
  payment_intent_id text primary key,
  livemode boolean not null,
  amount_refunded bigint not null default 0,
  refunded boolean not null default false
);

-- A user's Stripe customer, per mode (from their first checkout).
create table public.stripe_customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  livemode boolean not null,
  customer_id text not null unique,
  created_at timestamptz not null default now(),
  primary key (user_id, livemode)
);

create table public.stripe_subscriptions (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  customer_id text not null,
  livemode boolean not null,
  -- Stripe's status: active, trialing, past_due, canceled, unpaid, ...
  status text not null,
  price_id text,
  lookup_key text,
  product_id text,
  quantity integer,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  -- The time of the event this row is from, and its kind (created 1,
  -- updated 2, deleted 3, for events in the same second), so an older
  -- event never overwrites a newer one (Stripe does not promise the order).
  stripe_updated_at timestamptz not null,
  stripe_event_rank smallint not null default 2,
  updated_at timestamptz not null default now()
);
create index stripe_subscriptions_user on public.stripe_subscriptions (user_id, livemode);

-- One-time payments (Checkout in payment mode).
create table public.stripe_payments (
  checkout_session_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  customer_id text,
  livemode boolean not null,
  payment_intent_id text unique,
  price_id text,
  lookup_key text,
  amount_total bigint,
  amount_refunded bigint not null default 0,
  currency text,
  -- paid, unpaid (waiting for a delayed payment method), failed, refunded
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stripe_payments_user on public.stripe_payments (user_id, livemode);

alter table public.stripe_customers enable row level security;
alter table public.stripe_subscriptions enable row level security;
alter table public.stripe_payments enable row level security;

create policy "users read their own Stripe customer" on public.stripe_customers
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read their own subscriptions" on public.stripe_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read their own payments" on public.stripe_payments
  for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.stripe_customers, public.stripe_subscriptions, public.stripe_payments from anon, authenticated;

-- A user id from Stripe's metadata, only if it is a real user here.
create or replace function payments_private.stripe_user(candidate text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where candidate ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and u.id = candidate::uuid
$$;

create or replace function public.stripe_record_event(payload text, signature text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t bigint;
  sigs text[];
  matched_live boolean;
  s record;
  ev jsonb;
  obj jsonb;
  item jsonb;
  live boolean;
  created timestamptz;
  uid uuid;
  period_end bigint;
begin
  if payload is null or signature is null or length(payload) > 262144 or length(signature) > 4000 then
    raise exception 'payload and signature are required' using errcode = '22023';
  end if;

  -- Stripe-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<payload>">
  t := (substring(signature from '(?:^|,)t=(\d{1,12})(?:,|$)'))::bigint;
  if t is null or abs(extract(epoch from now())::bigint - t) > 300 then
    raise exception 'stripe signature too old' using errcode = '28000';
  end if;
  select array_agg(m[1]) into sigs from regexp_matches(signature, '(?:^|,)v1=([0-9a-f]{64})', 'g') as m;

  for s in
    select name, decrypted_secret from vault.decrypted_secrets
    where name in ('stripe_test_webhook_secret', 'stripe_live_webhook_secret')
  loop
    if encode(extensions.hmac(t::text || '.' || payload, s.decrypted_secret, 'sha256'), 'hex') = any (coalesce(sigs, '{}')) then
      matched_live := s.name = 'stripe_live_webhook_secret';
    end if;
  end loop;
  if matched_live is null then
    raise exception 'stripe signature does not match' using errcode = '28000';
  end if;

  ev := payload::jsonb;
  live := coalesce((ev ->> 'livemode')::boolean, false);
  if live is distinct from matched_live then
    raise exception 'event mode does not match its secret' using errcode = '28000';
  end if;

  -- Each event once.
  insert into payments_private.stripe_events (id, type, livemode) values (ev ->> 'id', ev ->> 'type', live)
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  obj := ev -> 'data' -> 'object';
  created := to_timestamp((ev ->> 'created')::bigint);

  if ev ->> 'type' in ('checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed') then
    uid := payments_private.stripe_user(coalesce(obj ->> 'client_reference_id', obj -> 'metadata' ->> 'user_id'));
    if uid is not null and obj ->> 'customer' is not null then
      insert into public.stripe_customers (user_id, livemode, customer_id) values (uid, live, obj ->> 'customer')
      on conflict do nothing;
    end if;
    if obj ->> 'mode' = 'payment' then
      insert into public.stripe_payments as p (
        checkout_session_id, user_id, customer_id, livemode, payment_intent_id, price_id, lookup_key, amount_total, currency, status
      ) values (
        obj ->> 'id', uid, obj ->> 'customer', live, obj ->> 'payment_intent', obj -> 'metadata' ->> 'price_id',
        obj -> 'metadata' ->> 'lookup_key', (obj ->> 'amount_total')::bigint, obj ->> 'currency',
        case when ev ->> 'type' = 'checkout.session.async_payment_failed' then 'failed' else obj ->> 'payment_status' end
      )
      on conflict (checkout_session_id) do update set
        -- Never back: a refund stays, and a paid payment never becomes unpaid
        -- because an earlier event arrived late.
        status = case
          when p.status = 'refunded' then p.status
          when p.status = 'paid' and excluded.status = 'unpaid' then p.status
          else excluded.status
        end,
        payment_intent_id = coalesce(excluded.payment_intent_id, p.payment_intent_id),
        user_id = coalesce(p.user_id, excluded.user_id),
        updated_at = now();
      -- A refund that came first.
      update public.stripe_payments p set
        amount_refunded = r.amount_refunded,
        status = case when r.refunded then 'refunded' else p.status end,
        updated_at = now()
      from payments_private.stripe_refunds r
      where p.checkout_session_id = obj ->> 'id' and r.payment_intent_id = p.payment_intent_id and r.livemode = p.livemode;
      delete from payments_private.stripe_refunds r where r.payment_intent_id = obj ->> 'payment_intent' and r.livemode = live;
    end if;
    return 'recorded';
  end if;

  if ev ->> 'type' in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted') then
    uid := payments_private.stripe_user(obj -> 'metadata' ->> 'user_id');
    if uid is null then
      select c.user_id into uid from public.stripe_customers c where c.customer_id = obj ->> 'customer';
    end if;
    item := obj -> 'items' -> 'data' -> 0;
    period_end := coalesce((item ->> 'current_period_end')::bigint, (obj ->> 'current_period_end')::bigint);
    insert into public.stripe_subscriptions as sub (
      id, user_id, customer_id, livemode, status, price_id, lookup_key, product_id, quantity,
      cancel_at_period_end, current_period_end, canceled_at, ended_at, stripe_updated_at, stripe_event_rank
    ) values (
      obj ->> 'id', uid, obj ->> 'customer', live, obj ->> 'status', item -> 'price' ->> 'id', item -> 'price' ->> 'lookup_key',
      item -> 'price' ->> 'product', (item ->> 'quantity')::integer, coalesce((obj ->> 'cancel_at_period_end')::boolean, false),
      to_timestamp(period_end), to_timestamp((obj ->> 'canceled_at')::bigint), to_timestamp((obj ->> 'ended_at')::bigint), created,
      case ev ->> 'type' when 'customer.subscription.created' then 1 when 'customer.subscription.deleted' then 3 else 2 end
    )
    on conflict (id) do update set
      user_id = coalesce(sub.user_id, excluded.user_id),
      -- An ended subscription stays ended.
      status = case when sub.status in ('canceled', 'incomplete_expired') then sub.status else excluded.status end,
      price_id = excluded.price_id,
      lookup_key = excluded.lookup_key,
      product_id = excluded.product_id,
      quantity = excluded.quantity,
      cancel_at_period_end = excluded.cancel_at_period_end,
      current_period_end = excluded.current_period_end,
      canceled_at = excluded.canceled_at,
      ended_at = excluded.ended_at,
      stripe_updated_at = excluded.stripe_updated_at,
      stripe_event_rank = excluded.stripe_event_rank,
      updated_at = now()
    where (sub.stripe_updated_at, sub.stripe_event_rank) <= (excluded.stripe_updated_at, excluded.stripe_event_rank);
    return 'recorded';
  end if;

  if ev ->> 'type' = 'charge.refunded' and obj ->> 'payment_intent' is not null then
    update public.stripe_payments set
      amount_refunded = coalesce((obj ->> 'amount_refunded')::bigint, amount_refunded),
      status = case when coalesce((obj ->> 'refunded')::boolean, false) then 'refunded' else status end,
      updated_at = now()
    where payment_intent_id = obj ->> 'payment_intent' and livemode = live;
    if not found then
      -- The payment is not here yet (or is another app's, in a Stripe
      -- account several apps share): kept for when it arrives.
      insert into payments_private.stripe_refunds as r (payment_intent_id, livemode, amount_refunded, refunded)
      values (obj ->> 'payment_intent', live, coalesce((obj ->> 'amount_refunded')::bigint, 0), coalesce((obj ->> 'refunded')::boolean, false))
      on conflict (payment_intent_id) do update set
        amount_refunded = greatest(r.amount_refunded, excluded.amount_refunded),
        refunded = r.refunded or excluded.refunded;
    end if;
    return 'recorded';
  end if;

  return 'ignored';
end;
$$;

-- Only the webhook route calls it, with the publishable key (the anon role).
revoke all on function public.stripe_record_event(text, text) from public, anon, authenticated;
grant execute on function public.stripe_record_event(text, text) to anon;
revoke all on function payments_private.stripe_user(text) from public, anon, authenticated;
