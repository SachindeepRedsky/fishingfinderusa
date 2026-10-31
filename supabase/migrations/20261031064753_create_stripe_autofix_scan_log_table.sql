CREATE TABLE public.stripe_autofix_scan_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger text DEFAULT 'scheduled'::text NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    backend_mode text,
    notified boolean DEFAULT false NOT NULL,
    notification_channel text,
    notification_error text,
    scan_error text,
    auto_fix_attempted boolean DEFAULT false NOT NULL,
    auto_fix_results jsonb,
    post_fix_error_count integer,
    post_fix_warning_count integer,
    post_fix_issues jsonb
);

INSERT INTO public.stripe_autofix_scan_log (id, scanned_at, trigger, error_count, warning_count, issues, backend_mode, notified, notification_channel, notification_error, scan_error, auto_fix_attempted, auto_fix_results, post_fix_error_count, post_fix_warning_count, post_fix_issues)
VALUES
(E'68da99bf-c108-45f9-ba19-d7d6f39b7470', E'2026-05-06 23:19:45.855353+00', E'manual-test', E'0', E'0', E'{}', E'unknown', E'f', NULL, NULL, NULL, E'f', NULL, NULL, NULL, NULL),
(E'7fc3bf75-3f99-4cad-a5a5-afa7216ff99a', E'2026-05-06 23:43:06.295639+00', E'manual', E'0', E'0', E'{}', E'unknown', E'f', NULL, NULL, NULL, E'f', NULL, NULL, NULL, NULL),
(E'f04d5943-9eee-41a0-a41a-7ba65c9e9bcb', E'2026-05-06 23:44:42.790474+00', E'manual', E'0', E'0', E'{}', E'unknown', E'f', NULL, NULL, NULL, E'f', NULL, NULL, NULL, NULL),
(E'44a6f83f-67b5-4f42-8e0f-2ca67af6b939', E'2026-05-12 11:43:31.06112+00', E'manual', E'0', E'0', E'{}', E'test', E'f', NULL, NULL, NULL, E'f', NULL, NULL, NULL, NULL);

ALTER TABLE ONLY public.stripe_autofix_scan_log ADD CONSTRAINT stripe_autofix_scan_log_pkey PRIMARY KEY (id);

CREATE INDEX stripe_autofix_scan_log_scanned_at_idx ON public.stripe_autofix_scan_log USING btree (scanned_at DESC);