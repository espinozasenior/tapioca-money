
-- LiqX Autonomous Agent Database Schema

-- Users Table: Tracks opt-in status and wallet addresses
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    auto_optimize_enabled BOOLEAN DEFAULT FALSE,
    agent_registered BOOLEAN DEFAULT FALSE,
    authorization_7702 JSONB, -- EIP-7702 authorization data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Strategies: Stores specific preferences for rebalancing
CREATE TABLE IF NOT EXISTS user_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    min_apy_gain_threshold DECIMAL DEFAULT 0.5, -- Minimum APY % gain to trigger rebalance
    max_slippage_tolerance DECIMAL DEFAULT 0.5, -- Max % slippage allowed
    risk_level TEXT DEFAULT 'medium', -- low, medium, high
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Actions: Audit log of every action performed by the agent
CREATE TABLE IF NOT EXISTS agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'rebalance', 'health_check', 'optimization_check'
    status TEXT NOT NULL, -- 'pending', 'success', 'failed'
    from_protocol TEXT,
    to_protocol TEXT,
    amount_usdc DECIMAL,
    tx_hash TEXT,
    error_message TEXT,
    metadata JSONB, -- Store full decision data or simulation results
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user_id ON agent_actions(user_id);
