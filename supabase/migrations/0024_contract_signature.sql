-- Online client e-signature for contracts.
-- The agency generates a signing link (bearer token) and sends it to the client;
-- the client opens a public page, agrees to the terms, and signs by hand.

alter table contracts add column if not exists sign_token         text;
alter table contracts add column if not exists sign_token_expires timestamptz;
alter table contracts add column if not exists signature_key      text;   -- R2 (private) PNG
alter table contracts add column if not exists signer_name        text;
alter table contracts add column if not exists signer_agreed      boolean not null default false;
alter table contracts add column if not exists signer_ip          text;
-- signed_at already exists on contracts (0001) — reused as the signature timestamp.

-- Fast, unique lookup by the bearer token used on the public signing page.
create unique index if not exists idx_contracts_sign_token on contracts (sign_token) where sign_token is not null;

-- Optional per-agency custom terms shown on the signing page (falls back to a
-- built-in bilingual default when null).
alter table agencies add column if not exists contract_terms text;
