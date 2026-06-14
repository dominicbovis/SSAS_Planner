/*
  # Add description column to scenarios table

  1. Changes
    - `scenarios`: adds `description` (text, nullable) column for free-text scenario notes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'description'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN description text DEFAULT '';
  END IF;
END $$;
