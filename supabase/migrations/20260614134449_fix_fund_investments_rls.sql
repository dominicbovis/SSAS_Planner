DROP POLICY IF EXISTS "select_fund_investments" ON fund_investments;
DROP POLICY IF EXISTS "insert_fund_investments" ON fund_investments;
DROP POLICY IF EXISTS "update_fund_investments" ON fund_investments;
DROP POLICY IF EXISTS "delete_fund_investments" ON fund_investments;

CREATE POLICY "Public can read fund investments"
  ON fund_investments FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert fund investments"
  ON fund_investments FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can update fund investments"
  ON fund_investments FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete fund investments"
  ON fund_investments FOR DELETE TO anon USING (true);
