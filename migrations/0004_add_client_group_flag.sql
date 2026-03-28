-- Add is_client_group field to email_groups table
ALTER TABLE email_groups
ADD COLUMN is_client_group BOOLEAN DEFAULT FALSE;