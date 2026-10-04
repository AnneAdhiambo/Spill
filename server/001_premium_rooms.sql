CREATE TABLE IF NOT EXISTS premium_payment_requests (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL,
  nostr_pubkey TEXT NOT NULL CHECK (nostr_pubkey ~ '^[0-9a-f]{64}$'),
  amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'redeeming', 'settled', 'failed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  swap_preview_ciphertext TEXT,
  redemption_ciphertext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_payment_requests_lookup ON premium_payment_requests (room_id, nostr_pubkey, status);

CREATE TABLE IF NOT EXISTS room_entitlements (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL,
  nostr_pubkey TEXT NOT NULL CHECK (nostr_pubkey ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status = 'active'),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  payment_reference UUID NOT NULL UNIQUE REFERENCES premium_payment_requests(id)
);
CREATE INDEX IF NOT EXISTS room_entitlements_access ON room_entitlements (room_id, nostr_pubkey, status, expires_at);
