ALTER TABLE ssas_schemes
  ADD COLUMN IF NOT EXISTS metro_bank_balance numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cater_allen_balance numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utb_balance numeric(15,2) DEFAULT 0;
