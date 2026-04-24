-- Transfer history: one row per successful customer-paid USDC send.
-- Populated by /api/transfer/send after receipt parsing (fire-and-forget —
-- a failed insert does not fail the user-facing response). Read by
-- /api/transfer/history for the "recent recipients" strip and tx list.
-- See tasks/spec-usdc-send.md §14.4.

CREATE TABLE IF NOT EXISTS transfer_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_hash         TEXT NOT NULL,
  user_op_hash    TEXT,
  recipient_addr  TEXT NOT NULL,           -- checksummed 0x
  recipient_label TEXT,                    -- ENS/Basename if input was one (cosmetic only)
  amount          NUMERIC(20, 6) NOT NULL, -- USDC amount sent
  fee_paid        NUMERIC(20, 6),          -- actual paymaster fee; null if parse failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_history_user_created
  ON transfer_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_history_user_recipient_created
  ON transfer_history (user_id, recipient_addr, created_at DESC);
