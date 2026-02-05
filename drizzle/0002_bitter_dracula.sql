CREATE INDEX IF NOT EXISTS "idx_agent_actions_user_created" ON "agent_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_actions_type_status" ON "agent_actions" USING btree ("action_type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_cron_query" ON "users" USING btree ("auto_optimize_enabled","agent_registered","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_wallet_address" ON "users" USING btree ("wallet_address");
