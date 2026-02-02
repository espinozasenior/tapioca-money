-- Migration: Add authorization_7702 column to users table
-- This migration adds support for EIP-7702 authorization storage

-- Add authorization_7702 column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'authorization_7702'
    ) THEN
        ALTER TABLE users ADD COLUMN authorization_7702 JSONB;
    END IF;
END $$;
