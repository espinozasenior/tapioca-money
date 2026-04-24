-- Paymaster CallPolicy version stamp (Option 2 customer-paid sends).
-- Backfills existing transfer_authorization rows so the server can
-- distinguish legacy v1 sessions (transfer-only) from v2 sessions
-- (transfer + paymaster-approve). Idempotent: the `?` test guards re-runs.
-- See tasks/spec-usdc-send.md §7.1 and architecture §5.

UPDATE users
SET transfer_authorization = transfer_authorization || '{"permissionsVersion": 1}'::jsonb
WHERE transfer_authorization IS NOT NULL
  AND NOT (transfer_authorization ? 'permissionsVersion');
