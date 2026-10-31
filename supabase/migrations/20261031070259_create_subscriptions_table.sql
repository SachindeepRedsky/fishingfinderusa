CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    status text DEFAULT 'inactive'::text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    provider text DEFAULT 'stripe'::text,
    product_id text,
    purchase_token text,
    platform text,
    auto_renewing boolean,
    raw_receipt jsonb
);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);

CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions USING btree (stripe_customer_id);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE INDEX subscriptions_purchase_token_idx ON public.subscriptions USING btree (purchase_token);