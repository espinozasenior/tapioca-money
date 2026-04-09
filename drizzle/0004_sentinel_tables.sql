-- Sentinel v0: Circuit breaker tables
-- Run via: pnpm drizzle-kit push

-- Incident log: one row per trigger event per user
CREATE TABLE IF NOT EXISTS sentinel_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address    TEXT         NOT NULL,
  vault_address   TEXT         NOT NULL,
  protocol        TEXT         NOT NULL,
  signal_type     TEXT         NOT NULL,
  signal_value    NUMERIC,
  threshold       NUMERIC,
  action_taken    TEXT         NOT NULL,
  tx_hash         TEXT,
  amount_redeemed NUMERIC,
  session_type    TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_vault ON sentinel_incidents (vault_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_user  ON sentinel_incidents (user_address, created_at DESC);

-- Live vault status: one row per monitored vault, upserted each cycle
CREATE TABLE IF NOT EXISTS sentinel_vault_status (
  vault_address   TEXT PRIMARY KEY,
  protocol        TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'safe',
  last_check_at   TIMESTAMPTZ,
  share_price     NUMERIC,
  tvl             NUMERIC,
  depeg_delta     NUMERIC,
  max_redeem_zero BOOLEAN      DEFAULT FALSE,
  metadata        JSONB,
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_last_check ON sentinel_vault_status (last_check_at);
