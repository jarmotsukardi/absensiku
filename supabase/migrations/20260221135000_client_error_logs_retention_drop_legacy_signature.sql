-- Drop legacy 3-arg retention function signature so RPC resolves to the 4-arg version.

DROP FUNCTION IF EXISTS public.apply_client_error_logs_retention(interval, interval, interval);
