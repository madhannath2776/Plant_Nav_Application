# Tree Navigator — setup

1. **Env**: copy `.env.example` to `.env` and fill in your Supabase URL + anon key.
2. **Database**: open Supabase → SQL editor → run `supabase/schema.sql` (idempotent, safe to re-run).
   It creates/extends: `profiles`, `plants`, `plant_submissions`, `xp_events`, `achievements`,
   `user_achievements`, `admin_users`, the `leaderboard` view, RLS, storage buckets
   (`plant-images`, `avatars`) and the `approve_submission` / `reject_submission` RPCs.
3. **Make an admin** (SQL editor only — there is deliberately no way to do this from the app):
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'admin@example.com';
   ```
   The admin signs in on the normal login screen and is sent to `/admin`.
4. `pnpm install && pnpm build` (or `pnpm dev`).

## Behaviour
- User submits → `plant_submissions` (pending). Nothing is public yet, no XP.
- Admin **Accept** → plant is created in `plants` (with `source_submission_id`, `approved_by`, `approved_at`),
  submitter gets exactly +10 XP (row lock + unique `xp_events` row, so double clicks cannot double-reward),
  level/rank/achievements update, and the user sees the reward animation once.
- Admin **Reject** → status `rejected`, optional reason, no XP, never visible publicly.
- Admins are enforced in the database (`is_admin()` + RLS + security-definer RPCs). Users cannot change
  their own XP, level, role or submission status.
