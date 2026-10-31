CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spot_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_user_id_spot_id_key UNIQUE (user_id, spot_id);