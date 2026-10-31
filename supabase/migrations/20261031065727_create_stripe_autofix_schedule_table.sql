CREATE TABLE public.stripe_autofix_schedule (
    id text DEFAULT 'singleton'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    notification_email text,
    webhook_url text,
    scan_webhook_url text,
    monthly_price_id text,
    yearly_price_id text,
    frontend_mode text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_fix boolean DEFAULT false NOT NULL,
    CONSTRAINT singleton_check CHECK ((id = 'singleton'::text))
);

INSERT INTO public.stripe_autofix_schedule (id, enabled, notification_email, monthly_price_id, yearly_price_id, frontend_mode, created_at, updated_at, auto_fix)
VALUES
(E'singleton', E'f', NULL, E'price_1TS6y1RtiiZxlanqjPRH40DD', E'price_1TS6zHRtiiZxlanqrloYUE2J', E'test', E'2026-05-06 23:17:29.954831+00', E'2026-05-12 11:43:26.894+00', E'f');

ALTER TABLE ONLY public.stripe_autofix_schedule ADD CONSTRAINT stripe_autofix_schedule_pkey PRIMARY KEY (id);