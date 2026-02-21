ALTER TABLE public.feedback_reports
DROP CONSTRAINT IF EXISTS feedback_reports_feedback_type_check;

ALTER TABLE public.feedback_reports
ADD CONSTRAINT feedback_reports_feedback_type_check
CHECK (
  feedback_type = ANY (ARRAY['bug'::text, 'saran'::text, 'ticket'::text])
);
