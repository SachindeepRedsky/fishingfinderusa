CREATE TABLE public.admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.admins ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);

-- ALTER TABLE ONLY public.admins ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;