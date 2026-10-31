CREATE TABLE public.catches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spot_id integer NOT NULL,
    spot_name text NOT NULL,
    fish_species text NOT NULL,
    weight_lbs numeric(6,2),
    length_inches numeric(6,2),
    bait_lure text,
    catch_date date DEFAULT CURRENT_DATE NOT NULL,
    catch_time time without time zone,
    weather text,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.catches ADD CONSTRAINT catches_pkey PRIMARY KEY (id);

CREATE INDEX idx_catches_created_at ON public.catches USING btree (created_at DESC);

CREATE INDEX idx_catches_spot_id ON public.catches USING btree (spot_id);

CREATE INDEX idx_catches_user_id ON public.catches USING btree (user_id);