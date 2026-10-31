CREATE TABLE public.catch_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    species text NOT NULL,
    weight_lbs numeric(6,2),
    length_inches numeric(5,1),
    location text NOT NULL,
    state text,
    water_body text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    time_of_day text,
    weather text,
    method text,
    lure_bait text,
    photo_url text,
    notes text,
    is_personal_best boolean DEFAULT false,
    catch_and_release boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.catch_log ADD CONSTRAINT catch_log_pkey PRIMARY KEY (id);

CREATE INDEX idx_catch_log_date ON public.catch_log USING btree (date);

CREATE INDEX idx_catch_log_species ON public.catch_log USING btree (species);

CREATE INDEX idx_catch_log_user_id ON public.catch_log USING btree (user_id);