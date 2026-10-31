CREATE TABLE public.stripe_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text,
    event_type text NOT NULL,
    signature_valid boolean DEFAULT false NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    error_message text,
    payload_summary jsonb,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);

CREATE INDEX stripe_webhook_events_received_at_idx ON public.stripe_webhook_events USING btree (received_at DESC);