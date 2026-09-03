-- Brute-force throttling for the sign-in form.
--
-- Supabase's own `sign_in_sign_ups` rate limit is a hosted-platform control and is not
-- applied by local GoTrue, so password sign-in is otherwise unthrottled. This table backs
-- an application-level limit that behaves the same locally and in production, and unlike
-- an in-memory counter it survives serverless cold starts.

create table public.login_attempts (
  id bigint generated always as identity primary key,
  -- sha256 of "<client ip>|<lowercased email>". The raw address and the address/email
  -- pairing are never stored, so a leak of this table does not reveal who tried to sign in.
  identifier text not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_identifier_time_idx
  on public.login_attempts (identifier, attempted_at desc);

comment on table public.login_attempts is
  'Failed sign-in attempts, keyed by a hash of client IP + email. Written only by the server using the secret key; unreachable from the Data API.';

-- RLS enabled with deliberately no policies: that denies anon and authenticated outright.
-- Only the service role, which bypasses RLS, may read or write this table.
alter table public.login_attempts enable row level security;

revoke all on public.login_attempts from anon, authenticated;
