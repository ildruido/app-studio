-- The admin command can disable an account (disable-user): it can't sign in and its sessions end.
ALTER TABLE users ADD COLUMN disabled_at timestamptz;
