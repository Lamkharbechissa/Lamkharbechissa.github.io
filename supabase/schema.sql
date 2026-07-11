-- ============================================================================
--  ISSA — Historique des conversations (base PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase : Dashboard → SQL Editor → coller → Run.
--
--  Modèle « anonyme strict » :
--   • Chaque visiteur est un utilisateur ANONYME Supabase (auth.uid()),
--     créé sans email ni donnée personnelle, mémorisé dans son navigateur.
--   • Le visiteur retrouve et continue UNIQUEMENT ses propres conversations
--     (Row Level Security : user_id = auth.uid()).
--   • L'admin (vous) voit TOUT via le Dashboard Supabase (Table Editor), qui
--     utilise la clé de service et contourne la RLS. Aucune identité réelle
--     n'est stockée : seul un UUID anonyme par visiteur.
-- ============================================================================

-- 1) TABLE DES CONVERSATIONS ------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'Nouvelle conversation',
  lang        text not null default 'fr',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) TABLE DES MESSAGES -----------------------------------------------------
create table if not exists public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null check (char_length(content) <= 8000),
  created_at       timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_conversations_user on public.conversations(user_id, updated_at desc);

-- 3) SÉCURITÉ : Row Level Security ------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Un visiteur ne voit et ne modifie QUE ses propres conversations
create policy "own_conversations_select" on public.conversations
  for select using (auth.uid() = user_id);
create policy "own_conversations_insert" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "own_conversations_update" on public.conversations
  for update using (auth.uid() = user_id);
create policy "own_conversations_delete" on public.conversations
  for delete using (auth.uid() = user_id);

-- Idem pour les messages
create policy "own_messages_select" on public.messages
  for select using (auth.uid() = user_id);
create policy "own_messages_insert" on public.messages
  for insert with check (auth.uid() = user_id);
create policy "own_messages_delete" on public.messages
  for delete using (auth.uid() = user_id);

-- 4) Met à jour updated_at de la conversation à chaque nouveau message -------
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ============================================================================
--  5) BOÎTE DE RÉCEPTION (messages laissés par les visiteurs via le formulaire)
-- ----------------------------------------------------------------------------
--  Un visiteur (anonyme) peut LAISSER un message ; il ne peut PAS lire la boîte.
--  SEUL l'admin (vous, identifié par votre email) peut lire/supprimer les
--  messages — depuis la boîte de réception intégrée au site (voir js/admin.js)
--  OU depuis le dashboard Supabase.
--
--  ⚠️ Remplacez 'issa.alternance@gmail.com' par VOTRE email admin (le même que
--     vous utiliserez pour vous connecter à la boîte in-site).
-- ============================================================================
create table if not exists public.inbox (
  id          bigint generated always as identity primary key,
  user_id     uuid default auth.uid(),
  name        text not null check (char_length(name) <= 120),
  email       text check (char_length(email) <= 200),
  message     text not null check (char_length(message) <= 4000),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_inbox_created on public.inbox(created_at desc);

alter table public.inbox enable row level security;

-- N'importe quel visiteur (anonyme authentifié) peut DÉPOSER un message…
create policy "anyone_insert_inbox" on public.inbox
  for insert with check (auth.uid() = user_id);

-- …mais SEUL l'admin (par email) peut LIRE, MARQUER LU et SUPPRIMER.
create policy "admin_select_inbox" on public.inbox
  for select using ((auth.jwt() ->> 'email') = 'issa.alternance@gmail.com');
create policy "admin_update_inbox" on public.inbox
  for update using ((auth.jwt() ->> 'email') = 'issa.alternance@gmail.com');
create policy "admin_delete_inbox" on public.inbox
  for delete using ((auth.jwt() ->> 'email') = 'issa.alternance@gmail.com');

-- ============================================================================
--  CONSOLE ADMIN (vous)
--  → Boîte in-site : ouvrez votre site avec #boite-issa à la fin de l'URL
--    (ex. https://lamkharbechissa.github.io/#boite-issa), connectez-vous avec
--    votre email/mot de passe admin → vous voyez tous les messages.
--  → OU Dashboard Supabase → Table Editor → tables « conversations »,
--    « messages » et « inbox ». Exemple de requête :
--
--    select c.user_id, c.title, c.updated_at, count(m.*) as nb_messages
--    from conversations c left join messages m on m.conversation_id = c.id
--    group by c.id order by c.updated_at desc;
-- ============================================================================
