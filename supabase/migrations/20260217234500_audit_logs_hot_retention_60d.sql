-- Audit log hot retention policy:
-- keep hot data for 60 days, cleanup anything older (except maintenance markers).

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_retention_days INTEGER := 60;
    cutoff_date TIMESTAMPTZ;
    deleted_count INTEGER;
BEGIN
    cutoff_date := NOW() - make_interval(days => v_retention_days);

    DELETE FROM public.audit_logs
    WHERE created_at < cutoff_date
      AND action NOT IN ('CREATE_PARTITION', 'CLEANUP_GPS_DATA_PARTITIONED');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CLEANUP_AUDIT_LOGS',
            'audit_logs',
            jsonb_build_object(
                'retention_days', v_retention_days,
                'cutoff_date', cutoff_date,
                'deleted_count', deleted_count,
                'executed_at', NOW()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'retention_days', v_retention_days,
        'cutoff_date', cutoff_date,
        'deleted_count', deleted_count
    );
END;
$$;
