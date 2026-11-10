/*
# Store viewer email on planner shares

## Summary
Lets a planner owner see who they have shared with by email address, without needing
access to other people's profile records.

## Modified tables
- `planner_shares` gains `email` (text), the address the planner was shared with.
  - Existing rows (none at the time of this change) would show no email.

## Security changes
- None. The existing owner-only read and remove rules still apply.

## Important notes
1. Emails are written by the server sharing function only.
*/

ALTER TABLE planner_shares ADD COLUMN IF NOT EXISTS email text;
