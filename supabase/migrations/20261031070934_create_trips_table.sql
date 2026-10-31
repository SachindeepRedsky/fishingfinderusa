CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spot_id integer NOT NULL,
    spot_name text NOT NULL,
    spot_state text NOT NULL,
    spot_type text NOT NULL,
    accommodation_id integer,
    accommodation_name text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    notes text DEFAULT ''::text,
    share_id text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text),
    is_shared boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.trips ADD CONSTRAINT trips_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trips ADD CONSTRAINT trips_share_id_key UNIQUE (share_id);

ALTER TABLE ONLY public.trip_checklist_items ADD CONSTRAINT trip_checklist_items_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

CREATE INDEX idx_trips_share_id ON public.trips USING btree (share_id);

CREATE INDEX idx_trips_user_id ON public.trips USING btree (user_id);