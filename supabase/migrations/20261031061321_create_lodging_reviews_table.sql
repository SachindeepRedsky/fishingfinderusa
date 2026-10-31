CREATE TABLE public.lodging_reviews (
    id integer NOT NULL,
    lodging_id integer NOT NULL,
    user_id uuid NOT NULL,
    user_display_name text DEFAULT 'Anonymous'::text NOT NULL,
    rating integer NOT NULL,
    review_text text NOT NULL,
    stay_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lodging_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

CREATE SEQUENCE public.lodging_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.lodging_reviews_id_seq OWNED BY public.lodging_reviews.id;

ALTER TABLE ONLY public.lodging_reviews ALTER COLUMN id SET DEFAULT nextval('public.lodging_reviews_id_seq'::regclass);

ALTER TABLE ONLY public.lodging_reviews ADD CONSTRAINT lodging_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lodging_reviews ADD CONSTRAINT lodging_reviews_lodging_id_fkey FOREIGN KEY (lodging_id) REFERENCES public.lodging(id) ON DELETE CASCADE;

CREATE INDEX idx_lodging_reviews_created_at ON public.lodging_reviews USING btree (created_at DESC);

CREATE INDEX idx_lodging_reviews_lodging_id ON public.lodging_reviews USING btree (lodging_id);

CREATE INDEX idx_lodging_reviews_user_id ON public.lodging_reviews USING btree (user_id);

SELECT setval('public.lodging_reviews_id_seq', COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM public.lodging_reviews;