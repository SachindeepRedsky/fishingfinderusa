CREATE TABLE public.trip_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    text text NOT NULL,
    is_checked boolean DEFAULT false,
    category text DEFAULT 'general'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.trip_checklist_items ADD CONSTRAINT trip_checklist_items_pkey PRIMARY KEY (id);

CREATE INDEX idx_checklist_trip_id ON public.trip_checklist_items USING btree (trip_id);