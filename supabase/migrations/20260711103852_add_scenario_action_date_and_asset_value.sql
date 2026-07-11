ALTER TABLE scenario_actions
  ADD COLUMN IF NOT EXISTS action_date date,
  ADD COLUMN IF NOT EXISTS asset_value numeric,
  ADD COLUMN IF NOT EXISTS funding_source text;
