# Database Setup for Auto-Optimize Feature

This directory contains the database schema and migrations for the LiqX autonomous agent and auto-optimize functionality.

## Prerequisites

- Neon PostgreSQL database (recommended) or any PostgreSQL-compatible database
- Database URL configured in `.env` file

## Environment Setup

Add your database connection string to `.env`:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

## Initial Setup

### 1. Create Tables

Run the schema file to create all necessary tables:

```bash
psql $DATABASE_URL -f lib/yield-optimizer/db/schema.sql
```

Or connect to your Neon database console and execute the SQL from `schema.sql`.

### 2. Apply Migrations (If Upgrading)

If you're upgrading from an older version without the `authorization_7702` column:

```bash
psql $DATABASE_URL -f lib/yield-optimizer/db/migrate-add-authorization.sql
```

## Database Schema

### Tables

#### `users`
- Stores wallet addresses and auto-optimize preferences
- Tracks EIP-7702 authorization data
- Fields:
  - `id`: UUID primary key
  - `wallet_address`: Unique wallet address
  - `auto_optimize_enabled`: Boolean flag for auto-optimize feature
  - `agent_registered`: Boolean flag for agent registration status
  - `authorization_7702`: JSONB field storing EIP-7702 authorization data
  - `created_at`, `updated_at`: Timestamps

#### `user_strategies`
- Stores user-specific optimization preferences
- Fields:
  - `min_apy_gain_threshold`: Minimum APY gain to trigger rebalance (default: 0.5%)
  - `max_slippage_tolerance`: Maximum allowed slippage (default: 0.5%)
  - `risk_level`: Risk preference (low, medium, high)

#### `agent_actions`
- Audit log of all agent actions
- Tracks rebalancing operations, health checks, and optimization checks
- Includes transaction hashes and error messages for debugging

## API Endpoints

### `GET /api/agent/register?address={wallet_address}`
Check if agent is registered and auto-optimize is enabled for a wallet.

Response:
```json
{
  "isRegistered": true,
  "autoOptimizeEnabled": true,
  "hasAuthorization": true,
  "status": "active"
}
```

### `POST /api/agent/register`
Register agent with EIP-7702 authorization.

Body:
```json
{
  "address": "0x...",
  "authorization": {...}
}
```

### `PATCH /api/agent/register`
Update auto-optimize setting (toggle on/off).

Body:
```json
{
  "address": "0x...",
  "autoOptimizeEnabled": true
}
```

## Troubleshooting

### Connection Issues
- Verify `DATABASE_URL` is correctly set in `.env`
- Ensure your database allows SSL connections (Neon requires SSL)
- Check that your IP is whitelisted if using IP restrictions

### Missing Column Errors
If you see errors about missing `authorization_7702` column:
1. Run the migration: `migrate-add-authorization.sql`
2. Or manually add the column:
   ```sql
   ALTER TABLE users ADD COLUMN authorization_7702 JSONB;
   ```

### Permission Errors
Ensure your database user has permissions to:
- CREATE, ALTER, DROP tables
- INSERT, UPDATE, DELETE, SELECT data
