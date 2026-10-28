--
-- PostgreSQL database dump
--


-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.16

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: prj_F4XKrsTr5YoN; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "prj_F4XKrsTr5YoN";


--
-- Name: prj_F4XKrsTr5YoN_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "prj_F4XKrsTr5YoN_auth";


--
-- Name: prj_F4XKrsTr5YoN_storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "prj_F4XKrsTr5YoN_storage";


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: crm_campaigns; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text,
    html_body text,
    text_body text,
    status text DEFAULT 'draft'::text,
    list_id uuid,
    filter_query jsonb,
    list_ids jsonb,
    style_preset text,
    images jsonb,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    total_recipients integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    channel text DEFAULT 'email'::text NOT NULL,
    goal_id uuid,
    CONSTRAINT crm_campaigns_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
    CONSTRAINT crm_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: crm_campaigns_claim_due(integer); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_campaigns_claim_due(p_limit integer) RETURNS SETOF "prj_F4XKrsTr5YoN".crm_campaigns
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY UPDATE crm_campaigns
SET status = 'sending', sent_at = NULL
WHERE id IN (
SELECT due_id FROM (
SELECT id AS due_id FROM crm_campaigns
WHERE status = 'scheduled' AND scheduled_at <= NOW()
ORDER BY scheduled_at
FOR UPDATE SKIP LOCKED
LIMIT p_limit
) due_rows
)
RETURNING *;
END $$;


--
-- Name: crm_delete_pipeline(uuid); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_delete_pipeline(p_pipeline_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
DELETE FROM crm_opportunities WHERE pipeline_id = p_pipeline_id;
DELETE FROM crm_pipeline_stages WHERE pipeline_id = p_pipeline_id;
DELETE FROM crm_pipelines WHERE id = p_pipeline_id;
END $$;


--
-- Name: crm_flow_step_queue; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_flow_step_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    resume_step_order integer NOT NULL,
    run_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    last_error text,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_flow_queue_claim(integer, text, integer); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_flow_queue_claim(p_limit integer, p_worker text, p_lock_seconds integer DEFAULT 300) RETURNS SETOF "prj_F4XKrsTr5YoN".crm_flow_step_queue
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY UPDATE crm_flow_step_queue
SET locked_at = NOW(),
locked_by = p_worker,
attempts = attempts + 1
WHERE id IN (
SELECT due_id FROM (
SELECT id AS due_id FROM crm_flow_step_queue
WHERE finished_at IS NULL
AND attempts < max_attempts
AND run_at <= NOW()
AND (locked_at IS NULL OR locked_at < NOW() - make_interval(secs => p_lock_seconds))
ORDER BY run_at
FOR UPDATE SKIP LOCKED
LIMIT p_limit
) due_rows
)
RETURNING *;
END $$;


--
-- Name: crm_goal_work; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_goal_work (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    not_before timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    last_error text,
    locked_at timestamp with time zone,
    locked_by text,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_goal_work_kind_check CHECK ((kind = ANY (ARRAY['rematch'::text, 'classify'::text, 'reply'::text, 'evaluate'::text, 'send'::text]))),
    CONSTRAINT crm_goal_work_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: crm_goal_work_claim(integer, text, integer); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_goal_work_claim(p_limit integer, p_worker text, p_lock_seconds integer DEFAULT 300) RETURNS SETOF "prj_F4XKrsTr5YoN".crm_goal_work
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY UPDATE crm_goal_work
SET locked_at = NOW(),
locked_by = p_worker,
status = 'processing',
attempts = attempts + 1
WHERE id IN (
SELECT due_id FROM (
SELECT id AS due_id FROM crm_goal_work
WHERE finished_at IS NULL
AND status IN ('pending', 'processing')
AND attempts < max_attempts
AND not_before <= NOW()
AND (locked_at IS NULL OR locked_at < NOW() - make_interval(secs => p_lock_seconds))
ORDER BY not_before
FOR UPDATE SKIP LOCKED
LIMIT p_limit
) due_rows
)
RETURNING *;
END $$;


--
-- Name: crm_retype_stage(uuid, text); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_retype_stage(p_stage_id uuid, p_new_type text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
v_status TEXT := CASE WHEN p_new_type = 'won' THEN 'won' WHEN p_new_type = 'lost' THEN 'lost' ELSE 'open' END;
BEGIN
UPDATE crm_pipeline_stages SET type = p_new_type, updated_at = NOW() WHERE id = p_stage_id;
UPDATE crm_opportunities SET
status = v_status,
won_at = CASE WHEN v_status = 'won' THEN NOW() ELSE NULL END,
lost_at = CASE WHEN v_status = 'lost' THEN NOW() ELSE NULL END,
updated_at = NOW()
WHERE stage_id = p_stage_id;
END $$;


--
-- Name: crm_sends; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid,
    campaign_id uuid,
    flow_id uuid,
    contact_id uuid,
    direction text DEFAULT 'outbound'::text NOT NULL,
    source text,
    created_by text,
    status text DEFAULT 'draft'::text NOT NULL,
    to_email text,
    from_email text,
    subject text,
    body text,
    draft_body text,
    approved_by text,
    approved_at timestamp with time zone,
    mailgun_message_id text,
    in_reply_to text,
    thread_references text,
    idempotency_key text,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone,
    locked_at timestamp with time zone,
    locked_by text,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_sends_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text]))),
    CONSTRAINT crm_sends_source_check CHECK ((source = ANY (ARRAY['campaign'::text, 'flow'::text, 'reply'::text, 'manual'::text]))),
    CONSTRAINT crm_sends_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'received'::text])))
);


--
-- Name: crm_sends_claim_due(integer, text, integer); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".crm_sends_claim_due(p_limit integer, p_worker text, p_lock_seconds integer DEFAULT 300) RETURNS SETOF "prj_F4XKrsTr5YoN".crm_sends
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY UPDATE crm_sends
SET status = 'sending',
locked_at = NOW(),
locked_by = p_worker,
attempts = attempts + 1
WHERE id IN (
SELECT due_id FROM (
SELECT id AS due_id FROM crm_sends
WHERE direction = 'outbound'
AND status = 'approved'
AND attempts < max_attempts
AND (locked_at IS NULL OR locked_at < NOW() - make_interval(secs => p_lock_seconds))
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT p_limit
) due_rows
)
RETURNING *;
END $$;


--
-- Name: delete_user_account(uuid); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".delete_user_account(uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'prj_F4XKrsTr5YoN', 'public'
    AS $$
BEGIN
IF uid IS NULL THEN
RAISE EXCEPTION 'uid cannot be null';
END IF;
PERFORM set_config('request.jwt.claim.sub', uid::text, true);
PERFORM set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
BEGIN DELETE FROM favorites WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
BEGIN DELETE FROM catches WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
BEGIN DELETE FROM trips WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
BEGIN DELETE FROM lodging_reviews WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
BEGIN DELETE FROM subscriptions WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
BEGIN DELETE FROM profiles WHERE id = uid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END;
DELETE FROM "prj_F4XKrsTr5YoN_auth".identities WHERE user_id = uid;
DELETE FROM "prj_F4XKrsTr5YoN_auth".users WHERE id = uid;
END;
$$;


--
-- Name: realtime_notify_subscriptions(); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".realtime_notify_subscriptions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE
        payload jsonb;
        payload_text text;
      BEGIN
        payload := jsonb_build_object(
          'type', TG_OP,
          'schema', 'public',
          'table', TG_TABLE_NAME,
          'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END,
          'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
          'commit_timestamp', now()::text
        );
        payload_text := payload::text;
        -- pg_notify has an 8000-byte limit; truncate large payloads to avoid
        -- breaking the user's INSERT/UPDATE/DELETE with "payload string too long"
        IF length(payload_text) > 7500 THEN
          -- Send a slim payload with just IDs so the client can re-fetch
          payload := jsonb_build_object(
            'type', TG_OP,
            'schema', 'public',
            'table', TG_TABLE_NAME,
            'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN jsonb_build_object('id', NEW.id) ELSE NULL END,
            'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN jsonb_build_object('id', OLD.id) ELSE NULL END,
            'commit_timestamp', now()::text,
            'truncated', true
          );
          payload_text := payload::text;
        END IF;
        BEGIN
          PERFORM pg_notify('realtime:erbligiwkdfwxkhvwepw:public:subscriptions', payload_text);
        EXCEPTION WHEN OTHERS THEN
          -- Never let notification failures break user DML operations
          NULL;
        END;
        RETURN COALESCE(NEW, OLD);
      END;
      $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_lodging_rating(); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN".update_lodging_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
UPDATE lodging
SET
rating = COALESCE((
SELECT ROUND(AVG(rating)::numeric, 1)
FROM lodging_reviews
WHERE lodging_id = COALESCE(NEW.lodging_id, OLD.lodging_id)
), 0),
review_count = (
SELECT COUNT(*)
FROM lodging_reviews
WHERE lodging_id = COALESCE(NEW.lodging_id, OLD.lodging_id)
)
WHERE id = COALESCE(NEW.lodging_id, OLD.lodging_id);
RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: auth_uid(); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN_auth".auth_uid() RETURNS uuid
    LANGUAGE sql
    AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;


--
-- Name: role(); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN_auth".role() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon')
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

CREATE FUNCTION "prj_F4XKrsTr5YoN_storage".foldername(name text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT string_to_array(name, '/')
$$;


--
-- Name: accommodations; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".accommodations (
    id integer NOT NULL,
    spot_id integer NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    address text NOT NULL,
    phone character varying(20),
    price_min integer NOT NULL,
    price_max integer NOT NULL,
    rating numeric(2,1) DEFAULT 4.0,
    description text,
    amenities text[],
    website character varying(500),
    distance_miles numeric(4,1),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT accommodations_type_check CHECK (((type)::text = ANY ((ARRAY['hotel'::character varying, 'motel'::character varying, 'airbnb'::character varying, 'lodge'::character varying, 'cabin'::character varying, 'resort'::character varying])::text[])))
);


--
-- Name: accommodations_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE SEQUENCE "prj_F4XKrsTr5YoN".accommodations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_id_seq; Type: SEQUENCE OWNED BY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER SEQUENCE "prj_F4XKrsTr5YoN".accommodations_id_seq OWNED BY "prj_F4XKrsTr5YoN".accommodations.id;


--
-- Name: admins; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: catch_log; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".catch_log (
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


--
-- Name: catches; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".catches (
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


--
-- Name: crm_appointments; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid,
    contact_id uuid,
    contact_email text NOT NULL,
    contact_name text,
    contact_phone text,
    title text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'confirmed'::text,
    notes text,
    source text DEFAULT 'manual'::text,
    google_event_id text,
    calendly_event_id text,
    assigned_user_id text,
    assigned_membership_id uuid,
    participant_count integer DEFAULT 1,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_appointments_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'public_link'::text, 'google'::text, 'calendly'::text]))),
    CONSTRAINT crm_appointments_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text, 'rescheduled'::text])))
);


--
-- Name: crm_availability; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: crm_calendar_members; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_calendar_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid,
    user_id text NOT NULL,
    user_google_calendar_id text,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    user_outlook_calendar_id text
);


--
-- Name: crm_calendars; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Default Calendar'::text NOT NULL,
    slug text,
    description text,
    calendar_type text DEFAULT 'personal'::text,
    owner_user_id text,
    max_participants integer DEFAULT 1,
    date_range_days integer,
    slot_duration integer DEFAULT 30,
    slot_interval integer DEFAULT 0,
    max_bookings_per_day integer,
    min_notice_hours integer DEFAULT 1,
    buffer_before integer DEFAULT 0,
    buffer_after integer DEFAULT 0,
    timezone text DEFAULT 'America/New_York'::text,
    is_active boolean DEFAULT true,
    meeting_location_type text DEFAULT 'custom'::text,
    meeting_location_value text,
    google_calendar_id text,
    google_refresh_token text,
    calendly_user_uri text,
    calendly_webhook_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    calendly_connection_id uuid,
    host_notify_on_booking boolean DEFAULT true,
    CONSTRAINT crm_calendars_calendar_type_check CHECK ((calendar_type = ANY (ARRAY['personal'::text, 'round_robin'::text, 'class'::text, 'collective'::text])))
);


--
-- Name: crm_calendly_connections; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_calendly_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    calendly_user_uri text NOT NULL,
    calendly_user_email text,
    calendly_user_name text,
    calendly_org_uri text,
    encrypted_access_token text NOT NULL,
    signing_key text NOT NULL,
    webhook_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_contact_lists; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_contact_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    list_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_contacts; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    phone text,
    sms_opt_in boolean DEFAULT false,
    address jsonb,
    source text DEFAULT 'manual'::text,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    ecom_customer_id uuid,
    total_orders integer DEFAULT 0,
    total_spent integer DEFAULT 0,
    last_order_at timestamp with time zone,
    subscribed boolean DEFAULT true,
    subscribed_at timestamp with time zone DEFAULT now(),
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    first_order_at timestamp with time zone,
    purchased_product_ids text[] DEFAULT '{}'::text[],
    purchased_product_names text[] DEFAULT '{}'::text[]
);


--
-- Name: crm_events; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    campaign_id uuid,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    channel text DEFAULT 'email'::text NOT NULL,
    goal_id uuid,
    flow_id uuid,
    send_id uuid,
    event_key text,
    CONSTRAINT crm_events_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
    CONSTRAINT crm_events_event_type_check CHECK ((event_type = ANY (ARRAY['sent'::text, 'opened'::text, 'clicked'::text, 'bounced'::text, 'unsubscribed'::text, 'opt_out'::text, 'delivered'::text, 'failed'::text, 'undelivered'::text, 'replied'::text, 'converted'::text])))
);


--
-- Name: crm_flow_logs; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_flow_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid,
    step_id uuid,
    contact_id uuid,
    trigger_event text NOT NULL,
    status text DEFAULT 'executed'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_flow_logs_status_check CHECK ((status = ANY (ARRAY['executed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: crm_flow_steps; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_flow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid,
    step_order integer NOT NULL,
    action_type text NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_flow_steps_action_type_check CHECK ((action_type = ANY (ARRAY['send_email'::text, 'send_sms'::text, 'add_tag'::text, 'add_to_list'::text, 'wait'::text, 'create_opportunity'::text, 'move_opportunity_stage'::text, 'update_opportunity'::text, 'notify_email'::text, 'notify_sms'::text])))
);


--
-- Name: crm_flows; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cron_job_name text,
    last_fired_at timestamp with time zone,
    goal_id uuid,
    CONSTRAINT crm_flows_trigger_type_check CHECK ((trigger_type = ANY (ARRAY[(('contact'::text || chr(46)) || 'subscribed'::text), (('order'::text || chr(46)) || 'placed'::text), (('contact'::text || chr(46)) || 'tagged'::text), (('user'::text || chr(46)) || 'registered'::text), (('appointment'::text || chr(46)) || 'booked'::text), (('schedule'::text || chr(46)) || 'cron'::text), (('opportunity'::text || chr(46)) || 'created'::text), (('opportunity'::text || chr(46)) || 'stage_changed'::text), (('opportunity'::text || chr(46)) || 'won'::text), (('opportunity'::text || chr(46)) || 'lost'::text)])))
);


--
-- Name: crm_goal_actions; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_goal_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    action_type text NOT NULL,
    target_table text,
    target_id uuid,
    status text DEFAULT 'created'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: crm_goal_contacts; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_goal_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    conversation_state text DEFAULT 'ai_active'::text NOT NULL,
    matched_at timestamp with time zone DEFAULT now(),
    last_touched_at timestamp with time zone,
    converted_at timestamp with time zone,
    conversion_reason text,
    messages_sent integer DEFAULT 0 NOT NULL,
    replies_received integer DEFAULT 0 NOT NULL,
    insights jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_goal_contacts_convstate_check CHECK ((conversation_state = ANY (ARRAY['ai_active'::text, 'paused'::text, 'human'::text]))),
    CONSTRAINT crm_goal_contacts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'converted'::text, 'exited'::text, 'suppressed'::text])))
);


--
-- Name: crm_goal_runs; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_goal_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    run_type text DEFAULT 'plan'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    selection_stats jsonb DEFAULT '{}'::jsonb,
    processing_stats jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_goal_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT crm_goal_runs_type_check CHECK ((run_type = ANY (ARRAY['plan'::text, 'tick'::text, 'classify'::text, 'reply'::text, 'evaluate'::text])))
);


--
-- Name: crm_goals; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    objective_text text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    category text,
    tags text[] DEFAULT '{}'::text[],
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    success_criteria jsonb DEFAULT '{}'::jsonb,
    plan jsonb DEFAULT '{}'::jsonb,
    rules jsonb DEFAULT '{}'::jsonb,
    instructions text,
    sender jsonb DEFAULT '{}'::jsonb,
    created_by text,
    last_run_at timestamp with time zone,
    last_processed_at timestamp with time zone,
    last_contact_match_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_goals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'planning'::text, 'needs_approval'::text, 'active'::text, 'paused'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: crm_lists; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    filter_query jsonb,
    is_dynamic boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    goal_id uuid
);


--
-- Name: crm_opportunities; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    title text NOT NULL,
    value_cents integer DEFAULT 0,
    currency text DEFAULT 'usd'::text,
    status text DEFAULT 'open'::text NOT NULL,
    "position" integer DEFAULT 0,
    source text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    lost_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_opportunities_status_check CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: crm_opportunity_events; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_opportunity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    contact_id uuid,
    pipeline_id uuid,
    from_stage_id uuid,
    to_stage_id uuid,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_opportunity_events_type_check CHECK ((event_type = ANY (ARRAY['created'::text, 'stage_changed'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: crm_pipeline_stages; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0,
    type text DEFAULT 'open'::text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crm_pipeline_stages_type_check CHECK ((type = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: crm_pipelines; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".crm_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: favorites; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spot_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fishing_licenses; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".fishing_licenses (
    id integer NOT NULL,
    state text NOT NULL,
    state_abbr text NOT NULL,
    resident_annual_cost numeric(8,2),
    non_resident_annual_cost numeric(8,2),
    resident_daily_cost numeric(8,2),
    non_resident_daily_cost numeric(8,2),
    youth_exemption_age integer,
    senior_exemption_age integer,
    senior_discount_pct integer DEFAULT 0,
    free_fishing_days text,
    agency_name text NOT NULL,
    agency_url text NOT NULL,
    purchase_url text,
    notes text,
    freshwater_endorsement boolean DEFAULT false,
    saltwater_endorsement boolean DEFAULT false,
    trout_stamp_required boolean DEFAULT false,
    trout_stamp_cost numeric(8,2),
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fishing_licenses_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE SEQUENCE "prj_F4XKrsTr5YoN".fishing_licenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fishing_licenses_id_seq; Type: SEQUENCE OWNED BY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER SEQUENCE "prj_F4XKrsTr5YoN".fishing_licenses_id_seq OWNED BY "prj_F4XKrsTr5YoN".fishing_licenses.id;


--
-- Name: fishing_regulations; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".fishing_regulations (
    id integer NOT NULL,
    state text NOT NULL,
    state_abbr text NOT NULL,
    species text NOT NULL,
    daily_bag_limit integer,
    possession_limit integer,
    size_limit_inches numeric(5,1),
    slot_limit_min numeric(5,1),
    slot_limit_max numeric(5,1),
    season_open text,
    season_close text,
    season_notes text,
    special_rules text,
    water_body_type text DEFAULT 'all'::text NOT NULL,
    water_body_name text,
    catch_and_release_only boolean DEFAULT false,
    artificial_lures_only boolean DEFAULT false,
    barbless_hooks_required boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: fishing_regulations_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE SEQUENCE "prj_F4XKrsTr5YoN".fishing_regulations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fishing_regulations_id_seq; Type: SEQUENCE OWNED BY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER SEQUENCE "prj_F4XKrsTr5YoN".fishing_regulations_id_seq OWNED BY "prj_F4XKrsTr5YoN".fishing_regulations.id;


--
-- Name: fishing_species; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".fishing_species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    scientific_name text,
    category text,
    subcategory text,
    description text,
    image_url text,
    habitat text,
    average_size text,
    record_size text,
    best_seasons text[] DEFAULT '{}'::text[] NOT NULL,
    peak_season text,
    recommended_bait text[] DEFAULT '{}'::text[] NOT NULL,
    recommended_lures text[] DEFAULT '{}'::text[] NOT NULL,
    techniques text[] DEFAULT '{}'::text[] NOT NULL,
    difficulty text,
    fun_fact text,
    conservation text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fishing_spot_species; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".fishing_spot_species (
    fishing_spot_id integer NOT NULL,
    species_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fishing_spots; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".fishing_spots (
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    state text NOT NULL,
    city text,
    county text,
    country text DEFAULT 'USA'::text NOT NULL,
    address text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    water_type text DEFAULT 'lake'::text NOT NULL,
    access_type text,
    public_access boolean DEFAULT false NOT NULL,
    private_access boolean DEFAULT false NOT NULL,
    permit_required boolean DEFAULT false NOT NULL,
    permit_information text,
    best_seasons text,
    fishing_notes text,
    image_url text,
    website_url text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id integer NOT NULL,
    CONSTRAINT fishing_spots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text])))
);


--
-- Name: fishing_spots_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".fishing_spots ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "prj_F4XKrsTr5YoN".fishing_spots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lodging; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".lodging (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    state text NOT NULL,
    state_abbr text NOT NULL,
    city text NOT NULL,
    price_range text NOT NULL,
    price_per_night_min integer,
    price_per_night_max integer,
    proximity_to_water text NOT NULL,
    amenities text[] DEFAULT '{}'::text[],
    booking_url text,
    rating numeric(2,1) DEFAULT 0,
    review_count integer DEFAULT 0,
    description text,
    phone text,
    pet_friendly boolean DEFAULT false,
    seasonal boolean DEFAULT false,
    season_open text,
    season_close text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lodging_price_range_check CHECK ((price_range = ANY (ARRAY['$'::text, '$$'::text, '$$$'::text, '$$$$'::text]))),
    CONSTRAINT lodging_type_check CHECK ((type = ANY (ARRAY['hotel'::text, 'cabin'::text, 'campground'::text, 'lodge'::text, 'resort'::text, 'rv_park'::text])))
);


--
-- Name: lodging_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE SEQUENCE "prj_F4XKrsTr5YoN".lodging_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lodging_id_seq; Type: SEQUENCE OWNED BY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER SEQUENCE "prj_F4XKrsTr5YoN".lodging_id_seq OWNED BY "prj_F4XKrsTr5YoN".lodging.id;


--
-- Name: lodging_reviews; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".lodging_reviews (
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


--
-- Name: lodging_reviews_id_seq; Type: SEQUENCE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE SEQUENCE "prj_F4XKrsTr5YoN".lodging_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lodging_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER SEQUENCE "prj_F4XKrsTr5YoN".lodging_reviews_id_seq OWNED BY "prj_F4XKrsTr5YoN".lodging_reviews.id;


--
-- Name: profiles; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".profiles (
    id uuid NOT NULL,
    email text,
    display_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stripe_customer_id text
);


--
-- Name: stripe_autofix_scan_log; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".stripe_autofix_scan_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger text DEFAULT 'scheduled'::text NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    backend_mode text,
    notified boolean DEFAULT false NOT NULL,
    notification_channel text,
    notification_error text,
    scan_error text,
    auto_fix_attempted boolean DEFAULT false NOT NULL,
    auto_fix_results jsonb,
    post_fix_error_count integer,
    post_fix_warning_count integer,
    post_fix_issues jsonb
);


--
-- Name: stripe_autofix_schedule; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".stripe_autofix_schedule (
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


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".stripe_webhook_events (
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


--
-- Name: subscriptions; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".subscriptions (
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


--
-- Name: trip_checklist_items; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".trip_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    text text NOT NULL,
    is_checked boolean DEFAULT false,
    category text DEFAULT 'general'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: trips; Type: TABLE; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN".trips (
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


--
-- Name: identities; Type: TABLE; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN_auth".identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    provider text NOT NULL,
    identity_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN_auth".users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    encrypted_password text,
    email_confirmed_at timestamp with time zone,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);


--
-- Name: buckets; Type: TABLE; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN_storage".buckets (
    id text NOT NULL,
    name text NOT NULL,
    public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    file_size_limit bigint,
    allowed_mime_types text[]
);


--
-- Name: objects; Type: TABLE; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

CREATE TABLE "prj_F4XKrsTr5YoN_storage".objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    path_tokens text[],
    version text
);


--
-- Name: accommodations id; Type: DEFAULT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".accommodations ALTER COLUMN id SET DEFAULT nextval('"prj_F4XKrsTr5YoN".accommodations_id_seq'::regclass);


--
-- Name: fishing_licenses id; Type: DEFAULT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_licenses ALTER COLUMN id SET DEFAULT nextval('"prj_F4XKrsTr5YoN".fishing_licenses_id_seq'::regclass);


--
-- Name: fishing_regulations id; Type: DEFAULT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_regulations ALTER COLUMN id SET DEFAULT nextval('"prj_F4XKrsTr5YoN".fishing_regulations_id_seq'::regclass);


--
-- Name: lodging id; Type: DEFAULT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".lodging ALTER COLUMN id SET DEFAULT nextval('"prj_F4XKrsTr5YoN".lodging_id_seq'::regclass);


--
-- Name: lodging_reviews id; Type: DEFAULT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".lodging_reviews ALTER COLUMN id SET DEFAULT nextval('"prj_F4XKrsTr5YoN".lodging_reviews_id_seq'::regclass);


--
-- Data for Name: accommodations; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".accommodations (id, spot_id, name, type, address, phone, price_min, price_max, rating, description, amenities, website, distance_miles, created_at) FROM stdin;
2	1	Holiday Inn Express Guntersville	hotel	2140 Gunter Ave, Guntersville, AL 35976	(256) 582-2220	99	149	4.1	Modern hotel with complimentary breakfast and easy lake access.	{WiFi,Breakfast,Pool,"Fitness Center",Parking}	\N	3.2	2026-03-02 22:51:56.222976+00
3	1	Lakeside Cabin Retreat	airbnb	450 Lakeshore Dr, Guntersville, AL 35976	(256) 555-0142	125	225	4.7	Private lakefront cabin with dock, fire pit, and fish cleaning station.	{WiFi,Kitchen,Dock,"Fire Pit","Fish Cleaning Station","Lake View"}	\N	1.0	2026-03-02 22:51:56.222976+00
4	2	Best Western River City Hotel	hotel	1305 Front Ave NW, Decatur, AL 35601	(256) 355-3150	89	139	4.0	Comfortable hotel near Wheeler Lake with river views.	{WiFi,Breakfast,Pool,Parking,"River View"}	\N	2.5	2026-03-02 22:51:56.222976+00
5	2	Wheeler Lake Fishing Lodge	lodge	789 Wheeler Dam Rd, Decatur, AL 35601	(256) 555-0198	95	175	4.4	Fishing-focused lodge with guide services and tackle shop.	{WiFi,"Boat Ramp","Tackle Shop","Guide Service",Parking}	\N	0.8	2026-03-02 22:51:56.222976+00
6	3	The Battle House Renaissance Mobile	hotel	26 N Royal St, Mobile, AL 36602	(251) 338-2000	159	299	4.5	Historic luxury hotel in downtown Mobile near bay fishing.	{WiFi,Restaurant,Pool,Spa,"Valet Parking","Fitness Center"}	\N	4.0	2026-03-02 22:51:56.222976+00
7	3	Homewood Suites Mobile	hotel	570 W I-65 Service Rd S, Mobile, AL 36606	(251) 476-5600	109	169	4.2	All-suite hotel with full kitchen and complimentary breakfast.	{WiFi,Breakfast,Kitchen,Pool,Parking}	\N	6.0	2026-03-02 22:51:56.222976+00
8	3	Bay Breeze Waterfront Cottage	airbnb	312 Bay Front Ave, Mobile, AL 36602	(251) 555-0167	135	250	4.6	Charming waterfront cottage with private pier and kayaks.	{WiFi,Kitchen,Pier,Kayaks,"Water View",Grill}	\N	1.5	2026-03-02 22:51:56.222976+00
9	4	Kenai River Lodge	lodge	393 Riverside Dr, Soldotna, AK 99669	(907) 262-4292	199	399	4.6	Premier fishing lodge on the banks of the Kenai River with guide packages.	{WiFi,Restaurant,"Guide Service","Fish Processing","River View","Tackle Shop"}	\N	0.2	2026-03-02 22:51:56.222976+00
10	4	Aspen Hotel Soldotna	hotel	326 Binkley Cir, Soldotna, AK 99669	(907) 260-7736	149	249	4.3	Modern hotel with fish freezing service and river shuttle.	{WiFi,Breakfast,"Fish Freezer",Parking,Shuttle}	\N	2.0	2026-03-02 22:51:56.222976+00
11	4	Kenai Riverside Cabin	cabin	567 Funny River Rd, Soldotna, AK 99669	(907) 555-0134	175	350	4.8	Secluded riverside cabin with private river access and outdoor fire pit.	{WiFi,Kitchen,"River Access","Fire Pit",Grill,"Fish Cleaning Station"}	\N	1.5	2026-03-02 22:51:56.222976+00
12	5	Bristol Bay Sportfishing Lodge	lodge	Dillingham, AK 99576	(907) 842-2500	3500	8000	4.9	All-inclusive fly-in fishing lodge with world-class guides and gourmet meals.	{All-Inclusive,Fly-In,"Guide Service",Meals,Equipment,"Float Planes"}	\N	0.0	2026-03-02 22:51:56.222976+00
13	5	Tikchik Narrows Lodge	lodge	Tikchik Lake, Dillingham, AK 99576	(907) 555-0189	4000	7500	4.8	Remote wilderness lodge with pristine fishing and stunning scenery.	{All-Inclusive,Fly-In,"Guide Service",Meals,"Float Planes",Sauna}	\N	0.0	2026-03-02 22:51:56.222976+00
14	7	Lake Powell Resort	resort	100 Lakeshore Dr, Page, AZ 86040	(928) 645-2433	179	349	4.4	Lakefront resort with marina, boat rentals, and stunning red rock views.	{WiFi,Restaurant,Marina,"Boat Rental",Pool,"Lake View"}	\N	0.3	2026-03-02 22:51:56.222976+00
15	7	Courtyard by Marriott Page	hotel	600 Clubhouse Dr, Page, AZ 86040	(928) 645-5000	139	229	4.2	Modern hotel with pool and easy access to Lake Powell.	{WiFi,Restaurant,Pool,"Fitness Center",Parking}	\N	4.0	2026-03-02 22:51:56.222976+00
16	7	Dreamkatchers Lake Powell B&B	airbnb	166 S American Way, Page, AZ 86040	(928) 645-1174	119	199	4.7	Cozy bed & breakfast with panoramic views and homemade breakfast.	{WiFi,Breakfast,Views,Garden,Parking}	\N	5.0	2026-03-02 22:51:56.222976+00
17	9	Gaston's White River Resort	resort	1777 River Rd, Lakeview, AR 72642	(870) 431-5202	139	279	4.7	Legendary fishing resort on the White River with cottages and restaurant.	{WiFi,Restaurant,"Boat Dock","Guide Service","Fly Shop","River View"}	\N	0.1	2026-03-02 22:51:56.222976+00
18	9	White River Inn	motel	1063 White River Dr, Bull Shoals, AR 72619	(870) 445-4444	69	119	3.9	Budget-friendly motel with river access and fish cleaning station.	{WiFi,Parking,"Fish Cleaning Station","River Access"}	\N	1.0	2026-03-02 22:51:56.222976+00
19	20	Roland Martin Marina & Resort	resort	920 E Del Monte Ave, Clewiston, FL 33440	(863) 983-3151	99	189	4.3	Famous fishing resort with marina, tackle shop, and guide services.	{WiFi,Marina,"Tackle Shop","Guide Service",Pool,Restaurant}	\N	0.5	2026-03-02 22:51:56.222976+00
20	20	Holiday Inn Express Okeechobee	hotel	3101 US-441 S, Okeechobee, FL 34974	(863) 357-3529	109	169	4.0	Comfortable hotel with complimentary breakfast near the lake.	{WiFi,Breakfast,Pool,Parking,"Fitness Center"}	\N	5.0	2026-03-02 22:51:56.222976+00
21	20	Lakeside Angler's Cottage	airbnb	456 Lakeshore Blvd, Okeechobee, FL 34974	(863) 555-0178	89	165	4.5	Cozy cottage with lake views, screened porch, and boat parking.	{WiFi,Kitchen,"Screened Porch","Boat Parking","Lake View",Grill}	\N	2.0	2026-03-02 22:51:56.222976+00
22	21	Hawks Cay Resort	resort	61 Hawks Cay Blvd, Duck Key, FL 33050	(305) 743-7000	299	599	4.6	Luxury island resort with marina, fishing charters, and water sports.	{WiFi,Restaurant,Marina,Pool,Spa,"Fishing Charters",Beach}	\N	0.0	2026-03-02 22:51:56.222976+00
23	21	The Marker Waterfront Inn	hotel	200 William St, Key West, FL 33040	(305) 501-5193	249	449	4.5	Boutique waterfront hotel in the heart of Key West.	{WiFi,Pool,"Harbor View",Restaurant,Bar}	\N	0.5	2026-03-02 22:51:56.222976+00
24	21	Keys Fishing Cottage	airbnb	789 Overseas Hwy, Marathon, FL 33050	(305) 555-0156	175	325	4.7	Tropical cottage with private dock, kayaks, and ocean views.	{WiFi,Kitchen,"Private Dock",Kayaks,"Ocean View",Grill}	\N	0.3	2026-03-02 22:51:56.222976+00
25	11	The Ritz-Carlton Lake Tahoe	resort	13031 Ritz-Carlton Highlands Ct, Truckee, CA 96161	(530) 562-3000	399	899	4.7	Luxury mountain resort with ski-in/ski-out access and lake views.	{WiFi,Restaurant,Spa,Pool,"Fitness Center",Concierge}	\N	8.0	2026-03-02 22:52:30.767436+00
26	11	Basecamp Tahoe South	hotel	4143 Cedar Ave, South Lake Tahoe, CA 96150	(530) 208-0180	129	249	4.4	Trendy boutique hotel near the lake with complimentary bikes.	{WiFi,Bikes,"Hot Tub","Fire Pit",Parking}	\N	1.5	2026-03-02 22:52:30.767436+00
27	11	Tahoe Lakefront Cabin	cabin	3456 Lake Tahoe Blvd, South Lake Tahoe, CA 96150	(530) 555-0123	199	450	4.8	Stunning lakefront cabin with private beach and dock.	{WiFi,Kitchen,"Private Beach",Dock,"Hot Tub","Lake View"}	\N	0.1	2026-03-02 22:52:30.767436+00
28	14	The Lodge at Cathedral Pines	lodge	13175 S US-85, Sedalia, CO 80135	(303) 688-3000	149	279	4.3	Mountain lodge near Deckers with fly fishing packages.	{WiFi,Restaurant,"Fly Shop","Guide Service",Parking}	\N	5.0	2026-03-02 22:52:30.767436+00
29	14	Deckers River Cabin	cabin	234 Deckers Rd, Deckers, CO 80135	(303) 555-0145	125	225	4.5	Riverside cabin steps from the South Platte River.	{WiFi,Kitchen,"River Access","Fire Pit",Grill,Parking}	\N	0.3	2026-03-02 22:52:30.767436+00
30	43	Hyatt Regency Chesapeake Bay	resort	100 Heron Blvd, Cambridge, MD 21613	(410) 901-1234	199	449	4.5	Waterfront resort with marina, golf, and fishing charters.	{WiFi,Restaurant,Marina,Golf,Pool,Spa,"Fishing Charters"}	\N	0.0	2026-03-02 22:52:30.767436+00
31	43	Inn at Perry Cabin	hotel	308 Watkins Ln, St Michaels, MD 21663	(410) 745-2200	349	699	4.8	Luxury waterfront inn with sailing and fishing excursions.	{WiFi,Restaurant,Spa,Pool,Sailing,Fishing}	\N	2.0	2026-03-02 22:52:30.767436+00
32	43	Bay Breeze Cottage	airbnb	567 Shore Rd, Annapolis, MD 21401	(410) 555-0189	145	275	4.6	Charming waterfront cottage with crab traps and kayaks included.	{WiFi,Kitchen,Waterfront,Kayaks,"Crab Traps",Deck}	\N	1.0	2026-03-02 22:52:30.767436+00
33	47	The Homestead Resort	resort	1 Wood Ridge Rd, Glen Arbor, MI 49636	(231) 334-5000	179	399	4.4	Four-season resort on Lake Michigan with beach and marina.	{WiFi,Restaurant,Beach,Marina,Golf,Pool,Spa}	\N	0.0	2026-03-02 22:52:30.767436+00
34	47	Cherry Tree Inn	hotel	2345 US-31 N, Traverse City, MI 49686	(231) 938-8888	109	199	4.2	Lakeside hotel with private beach and complimentary breakfast.	{WiFi,Breakfast,Beach,Pool,Parking}	\N	3.0	2026-03-02 22:52:30.767436+00
35	50	Grand Casino Mille Lacs	hotel	777 Grand Ave, Onamia, MN 56359	(320) 532-7777	99	199	4.1	Casino hotel with lake access and fishing packages.	{WiFi,Restaurant,Casino,Pool,"Fishing Packages",Parking}	\N	2.0	2026-03-02 22:52:30.767436+00
36	50	Nitti's Hunters Point Resort	resort	5176 Hunters Point Rd, Isle, MN 56342	(320) 676-3453	129	249	4.6	Family fishing resort with cabins, boat rentals, and fish cleaning.	{WiFi,"Boat Rental","Fish Cleaning",Dock,"Lake View",Playground}	\N	0.5	2026-03-02 22:52:30.767436+00
37	50	Mille Lacs Lakefront Cabin	cabin	890 Lakeshore Dr, Garrison, MN 56450	(320) 555-0167	149	299	4.7	Cozy lakefront cabin with dock, boat lift, and panoramic views.	{WiFi,Kitchen,Dock,"Boat Lift","Lake View","Fire Pit"}	\N	0.2	2026-03-02 22:52:30.767436+00
38	54	Lodge of Four Seasons	resort	315 Four Seasons Dr, Lake Ozark, MO 65049	(573) 365-3000	149	349	4.3	Premier lake resort with marina, golf, and water sports.	{WiFi,Restaurant,Marina,Golf,Pool,Spa,"Water Sports"}	\N	0.5	2026-03-02 22:52:30.767436+00
39	54	Tan-Tar-A Resort	resort	494 Tan Tar A Dr, Osage Beach, MO 65065	(573) 348-3131	129	289	4.2	Family-friendly resort with indoor waterpark and lake access.	{WiFi,Restaurant,Waterpark,Marina,Pool,"Fitness Center"}	\N	1.0	2026-03-02 22:52:30.767436+00
40	54	Ozark Lakehouse	airbnb	234 Lakewood Dr, Osage Beach, MO 65065	(573) 555-0134	175	375	4.6	Spacious lakehouse with private dock, hot tub, and game room.	{WiFi,Kitchen,"Private Dock","Hot Tub","Game Room","Lake View",Grill}	\N	0.3	2026-03-02 22:52:30.767436+00
41	56	Chico Hot Springs Resort	resort	163 Chico Rd, Pray, MT 59065	(406) 333-4933	109	299	4.5	Historic resort with natural hot springs and fly fishing access.	{WiFi,Restaurant,"Hot Springs",Pool,"Horseback Riding","Fly Fishing"}	\N	15.0	2026-03-02 22:52:30.767436+00
42	56	Murray Hotel	hotel	201 W Park St, Livingston, MT 59047	(406) 222-1350	99	199	4.3	Historic downtown hotel near the Yellowstone River.	{WiFi,Restaurant,Bar,Parking,Historic}	\N	1.0	2026-03-02 22:52:30.767436+00
43	56	Paradise Valley Cabin	cabin	567 E River Rd, Livingston, MT 59047	(406) 555-0178	150	300	4.7	Riverside cabin in Paradise Valley with mountain views.	{WiFi,Kitchen,"River Access","Mountain View","Fire Pit",Grill}	\N	0.5	2026-03-02 22:52:30.767436+00
44	68	Tailwater Lodge	lodge	52 Pulaski St, Altmar, NY 13302	(315) 298-2030	149	279	4.6	Boutique fishing lodge on the Salmon River with guide services.	{WiFi,Restaurant,"Guide Service","Fly Shop","River View","Wader Room"}	\N	0.2	2026-03-02 22:53:07.843545+00
45	68	Salmon River Motel	motel	2858 NY-13, Pulaski, NY 13142	(315) 298-5440	69	129	3.8	Budget-friendly motel popular with salmon and steelhead anglers.	{WiFi,Parking,"Fish Cleaning Station",Kitchenette}	\N	1.5	2026-03-02 22:53:07.843545+00
46	68	River Run Cabin	cabin	345 River Rd, Altmar, NY 13302	(315) 555-0145	110	210	4.5	Cozy cabin with river access and wood-burning stove.	{WiFi,Kitchen,"River Access","Wood Stove","Fire Pit",Parking}	\N	0.5	2026-03-02 22:53:07.843545+00
47	71	Sanderling Resort	resort	1461 Duck Rd, Duck, NC 27949	(252) 261-4111	229	499	4.6	Oceanfront resort with spa, restaurants, and fishing pier access.	{WiFi,Restaurant,Spa,Pool,Beach,"Fitness Center"}	\N	0.0	2026-03-02 22:53:07.843545+00
48	71	Hilton Garden Inn Outer Banks	hotel	5353 N Virginia Dare Trail, Kitty Hawk, NC 27949	(252) 261-1290	149	279	4.3	Modern hotel with ocean views and easy beach access.	{WiFi,Breakfast,Pool,"Ocean View",Parking}	\N	2.0	2026-03-02 22:53:07.843545+00
49	71	OBX Beachfront Cottage	airbnb	789 Ocean Trail, Nags Head, NC 27959	(252) 555-0189	195	425	4.8	Stunning beachfront cottage with private beach access and fishing gear.	{WiFi,Kitchen,"Beach Access","Fishing Gear","Ocean View","Hot Tub",Deck}	\N	0.1	2026-03-02 22:53:07.843545+00
50	75	Kalahari Resorts Sandusky	resort	7000 Kalahari Dr, Sandusky, OH 44870	(419) 433-7200	199	449	4.4	Mega resort with indoor waterpark near Lake Erie fishing.	{WiFi,Restaurant,Waterpark,Pool,Spa,Arcade}	\N	8.0	2026-03-02 22:53:07.843545+00
51	75	Hotel Breakers	hotel	1 Cedar Point Dr, Sandusky, OH 44870	(419) 627-2106	149	299	4.2	Lakefront hotel at Cedar Point with beach access.	{WiFi,Restaurant,Beach,Pool,"Lake View"}	\N	0.5	2026-03-02 22:53:07.843545+00
52	75	Erie Shore Fishing Cabin	cabin	456 Lakeshore Rd, Port Clinton, OH 43452	(419) 555-0156	99	199	4.5	Lakefront cabin with boat dock and fish cleaning station.	{WiFi,Kitchen,"Boat Dock","Fish Cleaning Station","Lake View",Grill}	\N	0.3	2026-03-02 22:53:07.843545+00
53	79	Imperial River Company Lodge	lodge	304 Bakeoven Rd, Maupin, OR 97037	(541) 395-2404	129	229	4.5	Riverside lodge with rafting and fly fishing packages.	{WiFi,Restaurant,"Guide Service",Rafting,"River View",Parking}	\N	0.2	2026-03-02 22:53:07.843545+00
54	79	Deschutes Motel	motel	616 Mill St, Maupin, OR 97037	(541) 395-2626	79	139	4.0	Clean, simple motel in the heart of Maupin fishing country.	{WiFi,Parking,"River Access","Pet Friendly"}	\N	0.5	2026-03-02 22:53:07.843545+00
55	91	Lake Fork Resort	resort	9540 W FM 515, Alba, TX 75410	(903) 473-7236	89	179	4.3	Fishing resort with cabins, boat ramp, and tackle shop.	{WiFi,"Boat Ramp","Tackle Shop","Fish Cleaning","Lake View",Parking}	\N	0.5	2026-03-02 22:53:07.843545+00
56	91	Lake Fork Lodge	lodge	12345 State Hwy 154, Quitman, TX 75783	(903) 878-2265	109	199	4.4	Fishing lodge with guide services and lakefront access.	{WiFi,"Guide Service","Boat Rental","Fish Cleaning","Lake View"}	\N	1.0	2026-03-02 22:53:07.843545+00
57	91	Trophy Bass Cabin	cabin	678 Lakewood Trail, Quitman, TX 75783	(903) 555-0167	99	189	4.6	Private lakefront cabin with dock and fish cleaning station.	{WiFi,Kitchen,Dock,"Fish Cleaning Station","Lake View",Grill,"Fire Pit"}	\N	0.3	2026-03-02 22:53:07.843545+00
58	92	Port Royal Ocean Resort	resort	6317 State Hwy 361, Port Aransas, TX 78373	(361) 749-5011	179	399	4.5	Beachfront resort with pools, fishing pier, and charter services.	{WiFi,Restaurant,Pool,Beach,"Fishing Pier","Charter Service"}	\N	0.0	2026-03-02 22:53:07.843545+00
59	92	Holiday Inn Express Port Aransas	hotel	727 S 11th St, Port Aransas, TX 78373	(361) 749-4800	129	229	4.1	Comfortable hotel near the beach and fishing jetties.	{WiFi,Breakfast,Pool,Parking,"Beach Access"}	\N	1.0	2026-03-02 22:53:07.843545+00
60	92	Island Retreat Condo	airbnb	456 Beach Ave, Port Aransas, TX 78373	(361) 555-0134	149	299	4.6	Beachfront condo with balcony, pool access, and fishing gear storage.	{WiFi,Kitchen,Pool,"Beach View",Balcony,"Fishing Gear Storage"}	\N	0.2	2026-03-02 22:53:07.843545+00
61	100	The Edgewater Hotel	hotel	2411 Alaskan Way, Pier 67, Seattle, WA 98121	(206) 728-7000	249	549	4.6	Iconic waterfront hotel built over Elliott Bay with stunning views.	{WiFi,Restaurant,Bar,"Water View",Concierge,"Valet Parking"}	\N	0.0	2026-03-02 22:53:07.843545+00
62	100	Salmon Bay Fishing Lodge	lodge	1234 Shilshole Ave NW, Seattle, WA 98107	(206) 555-0178	149	279	4.4	Fishing lodge near Ballard with charter connections and fish processing.	{WiFi,"Fish Processing","Charter Connections",Parking,Kitchen}	\N	3.0	2026-03-02 22:53:07.843545+00
63	37	Kentucky Dam Village State Resort	resort	113 Administration Dr, Gilbertsville, KY 42044	(270) 362-4271	99	189	4.2	State park resort with lodge, cottages, marina, and golf.	{WiFi,Restaurant,Marina,Golf,Pool,Tennis,"Boat Rental"}	\N	0.5	2026-03-02 22:53:07.843545+00
64	37	Lighthouse Landing Resort	resort	320 W Commerce Ave, Grand Rivers, KY 42045	(270) 362-8201	119	249	4.5	Waterfront resort with cottages and marina on Kentucky Lake.	{WiFi,Marina,Cottage,"Lake View","Boat Rental","Fish Cleaning"}	\N	2.0	2026-03-02 22:53:07.843545+00
65	37	Angler's Cove Cabin	cabin	789 Lakeshore Dr, Gilbertsville, KY 42044	(270) 555-0145	89	175	4.6	Lakefront cabin with private dock and screened porch.	{WiFi,Kitchen,"Private Dock","Screened Porch","Lake View",Grill}	\N	0.3	2026-03-02 22:53:07.843545+00
66	6	Seward Windsong Lodge	lodge	31772 Herman Leirer Rd, Seward, AK 99664	(907) 224-7116	189	349	4.5	Mountain lodge surrounded by wilderness near Resurrection Bay.	{WiFi,Restaurant,Shuttle,"Mountain View",Parking}	\N	3.0	2026-03-02 22:53:42.463932+00
67	6	Harbor 360 Hotel	hotel	1412 4th Ave, Seward, AK 99664	(907) 224-3228	159	299	4.4	Waterfront hotel overlooking the small boat harbor.	{WiFi,Restaurant,"Harbor View",Parking,"Fish Processing"}	\N	0.5	2026-03-02 22:53:42.463932+00
68	8	Marble Canyon Lodge	lodge	US-89A, Marble Canyon, AZ 86036	(928) 355-2225	89	159	4.1	Historic lodge at the gateway to Lees Ferry fishing.	{WiFi,Restaurant,"Fly Shop","Guide Service",Parking}	\N	4.0	2026-03-02 22:53:42.463932+00
69	8	Lees Ferry Lodge	lodge	HC 67 Box 1, Marble Canyon, AZ 86036	(928) 355-2231	79	149	4.0	Rustic lodge near the Colorado River with stunning canyon views.	{WiFi,Restaurant,"Canyon View",Parking,"Fishing Access"}	\N	3.0	2026-03-02 22:53:42.463932+00
70	10	Mountain Harbor Resort	resort	994 Mountain Harbor Rd, Mount Ida, AR 71957	(870) 867-2191	129	269	4.6	Lakefront resort with marina, restaurant, and stunning lake views.	{WiFi,Restaurant,Marina,Pool,"Lake View","Boat Rental"}	\N	0.5	2026-03-02 22:53:42.463932+00
71	10	Lake Ouachita Fishing Cabin	cabin	456 Lakeshore Trail, Hot Springs, AR 71913	(501) 555-0189	99	195	4.5	Secluded cabin with lake access and private dock.	{WiFi,Kitchen,Dock,"Lake View","Fire Pit",Grill}	\N	1.0	2026-03-02 22:53:42.463932+00
72	12	Manchester Grand Hyatt San Diego	hotel	1 Market Pl, San Diego, CA 92101	(619) 232-1234	229	499	4.5	Luxury waterfront hotel overlooking San Diego Bay.	{WiFi,Restaurant,Pool,Spa,"Bay View","Fitness Center",Concierge}	\N	0.5	2026-03-02 22:53:42.463932+00
73	12	Humphreys Half Moon Inn	hotel	2303 Shelter Island Dr, San Diego, CA 92106	(619) 224-3411	179	349	4.4	Tropical resort on Shelter Island near fishing charter docks.	{WiFi,Restaurant,Pool,Marina,"Bay View",Parking}	\N	1.0	2026-03-02 22:53:42.463932+00
74	13	Win-River Resort & Casino	hotel	2100 Redding Rancheria Rd, Redding, CA 96001	(530) 243-3377	99	179	4.1	Casino resort near the Sacramento River with dining options.	{WiFi,Restaurant,Casino,Pool,Parking}	\N	5.0	2026-03-02 22:53:42.463932+00
75	13	Sacramento River RV Resort	cabin	8550 Riverview Dr, Redding, CA 96001	(530) 365-7965	79	149	4.3	Riverside cabins and RV sites with direct river access.	{WiFi,"River Access","Fish Cleaning","Boat Ramp",Parking}	\N	0.3	2026-03-02 22:53:42.463932+00
76	16	The Candlewood Inn	hotel	506 Candlewood Lake Rd, Brookfield, CT 06804	(203) 775-4400	139	249	4.3	Lakeside inn with event space and beautiful lake views.	{WiFi,Restaurant,"Lake View",Parking,"Event Space"}	\N	0.5	2026-03-02 22:53:42.463932+00
77	18	Hotel & Suites Lewes	hotel	107 Savannah Rd, Lewes, DE 19958	(302) 645-6466	129	249	4.2	Charming hotel in historic Lewes near bay fishing.	{WiFi,Breakfast,Pool,"Beach Access",Parking}	\N	2.0	2026-03-02 22:53:42.463932+00
78	18	Bay Resort Motel	motel	126 Anglers Rd, Lewes, DE 19958	(302) 645-9494	79	149	3.9	Budget motel with easy access to fishing piers and boat ramps.	{WiFi,Parking,"Fishing Access",Kitchenette}	\N	1.0	2026-03-02 22:53:42.463932+00
79	22	Holiday Inn Palatka	hotel	201 N 1st St, Palatka, FL 32177	(386) 328-3481	89	149	4.0	Riverside hotel with boat parking and river views.	{WiFi,Breakfast,Pool,"Boat Parking","River View"}	\N	0.5	2026-03-02 22:53:42.463932+00
80	23	Legacy Lodge at Lanier Islands	lodge	7000 Lanier Islands Pkwy, Buford, GA 30518	(770) 945-8787	149	329	4.3	Lakefront lodge with beach, water park, and marina.	{WiFi,Restaurant,Beach,"Water Park",Marina,Pool,Golf}	\N	0.5	2026-03-02 22:53:42.463932+00
81	23	Lake Lanier Luxury Lakehouse	airbnb	567 Lakeview Dr, Buford, GA 30518	(770) 555-0134	225	450	4.7	Stunning lakehouse with private dock, hot tub, and game room.	{WiFi,Kitchen,"Private Dock","Hot Tub","Game Room","Lake View",Grill}	\N	0.2	2026-03-02 22:53:42.463932+00
82	25	Royal Kona Resort	resort	75-5852 Alii Dr, Kailua-Kona, HI 96740	(808) 329-3111	179	399	4.2	Oceanfront resort with pool, luau, and charter fishing access.	{WiFi,Restaurant,Pool,"Ocean View",Luau,Parking}	\N	1.0	2026-03-02 22:53:42.463932+00
83	25	Kona Coast Resort	resort	78-6842 Alii Dr, Kailua-Kona, HI 96740	(808) 324-1721	159	349	4.4	Condo resort with ocean views and full kitchen units.	{WiFi,Kitchen,Pool,"Ocean View",Tennis,"BBQ Area"}	\N	2.0	2026-03-02 22:53:42.463932+00
84	27	Shilo Inn Suites Twin Falls	hotel	1586 Blue Lakes Blvd N, Twin Falls, ID 83301	(208) 733-7545	89	159	4.0	Comfortable hotel near Snake River Canyon with pool.	{WiFi,Breakfast,Pool,"Fitness Center",Parking}	\N	5.0	2026-03-02 22:53:42.463932+00
85	33	Bridges Bay Resort	resort	612 160th Ave, Arnolds Park, IA 51331	(712) 332-7100	149	329	4.4	Lakefront resort with indoor waterpark and marina.	{WiFi,Restaurant,Waterpark,Marina,Pool,"Lake View"}	\N	1.0	2026-03-02 22:53:42.463932+00
86	33	Fillenwarth Beach Resort	resort	87 Lakeshore Dr, Arnolds Park, IA 51331	(712) 332-5646	109	229	4.3	Family resort on West Okoboji Lake with beach and boat rental.	{WiFi,Beach,"Boat Rental","Lake View",Playground,Parking}	\N	3.0	2026-03-02 22:53:42.463932+00
87	39	Venice Marina & RV Park	lodge	101 Marina Dr, Venice, LA 70091	(504) 534-9357	89	169	4.1	Marina lodge with boat slips, fuel dock, and fish cleaning.	{WiFi,Marina,"Fish Cleaning","Fuel Dock",Parking}	\N	0.2	2026-03-02 22:54:17.873176+00
88	39	Tidewater Lodge Venice	lodge	234 River Rd, Venice, LA 70091	(504) 555-0167	119	229	4.3	Fishing lodge with charter connections and all-inclusive packages.	{WiFi,Restaurant,"Charter Service","Fish Processing",Parking}	\N	0.5	2026-03-02 22:54:17.873176+00
89	40	Cypress Bend Resort	resort	2000 Cypress Bend Pkwy, Many, LA 71449	(318) 590-1500	129	269	4.4	Lakefront golf resort with marina and fishing guide services.	{WiFi,Restaurant,Golf,Marina,Pool,"Guide Service"}	\N	0.5	2026-03-02 22:54:17.873176+00
90	40	Toledo Bend Lakehouse	airbnb	567 Lakeview Rd, Many, LA 71449	(318) 555-0145	99	225	4.6	Spacious lakehouse with dock, boat lift, and screened porch.	{WiFi,Kitchen,Dock,"Boat Lift","Screened Porch","Lake View"}	\N	0.3	2026-03-02 22:54:17.873176+00
91	41	Blair Hill Inn	hotel	351 Lily Bay Rd, Greenville, ME 04441	(207) 695-0224	199	399	4.7	Luxury hilltop inn with panoramic lake and mountain views.	{WiFi,Restaurant,"Lake View","Mountain View",Gardens,Parking}	\N	2.0	2026-03-02 22:54:17.873176+00
92	41	Moosehead Lakefront Cabin	cabin	234 Lily Bay Rd, Greenville, ME 04441	(207) 555-0189	129	275	4.6	Rustic lakefront cabin with canoe, fire pit, and wildlife viewing.	{WiFi,Kitchen,Canoe,"Fire Pit","Lake View",Wildlife}	\N	0.5	2026-03-02 22:54:17.873176+00
93	45	Wequassett Resort	resort	2173 Route 28, Harwich, MA 02646	(508) 432-5400	299	699	4.7	Luxury Cape Cod resort with private beach and sailing.	{WiFi,Restaurant,Beach,Pool,Sailing,Tennis,Spa}	\N	5.0	2026-03-02 22:54:17.873176+00
94	45	Chatham Bars Inn	resort	297 Shore Rd, Chatham, MA 02633	(508) 945-0096	349	799	4.8	Iconic oceanfront resort with fishing excursions and fine dining.	{WiFi,Restaurant,Beach,Pool,Spa,Fishing,Concierge}	\N	3.0	2026-03-02 22:54:17.873176+00
95	48	Gates Au Sable Lodge	lodge	471 Stephan Bridge Rd, Grayling, MI 49738	(989) 348-8462	109	199	4.5	Historic fly fishing lodge on the Au Sable River.	{WiFi,Restaurant,"Fly Shop","Guide Service","River View","Canoe Rental"}	\N	0.1	2026-03-02 22:54:17.873176+00
96	48	Riverside Cabin Grayling	cabin	345 Au Sable Dr, Grayling, MI 49738	(989) 555-0156	89	175	4.4	Cozy riverside cabin with canoe and fishing access.	{WiFi,Kitchen,"River Access",Canoe,"Fire Pit",Grill}	\N	0.3	2026-03-02 22:54:17.873176+00
97	51	Grand Ely Lodge	lodge	400 N Pioneer Rd, Ely, MN 55731	(218) 365-6565	119	249	4.3	Lakefront lodge near BWCA with outfitting services.	{WiFi,Restaurant,Outfitting,"Canoe Rental","Lake View",Sauna}	\N	5.0	2026-03-02 22:54:17.873176+00
98	51	Spirit of the Wilderness Outfitters	cabin	2030 E Sheridan St, Ely, MN 55731	(218) 365-3149	89	189	4.6	Outfitter cabins with complete BWCA trip planning.	{WiFi,Outfitting,"Canoe Rental",Maps,Permits,Parking}	\N	3.0	2026-03-02 22:54:17.873176+00
99	55	Big Cedar Lodge	resort	612 Devil's Pool Rd, Ridgedale, MO 65739	(417) 335-2777	179	449	4.6	Bass Pro Shops luxury wilderness resort with marina and spa.	{WiFi,Restaurant,Marina,Spa,Pool,Golf,"Nature Trails"}	\N	10.0	2026-03-02 22:54:17.873176+00
100	55	Still Waters Resort	resort	21 Stillwater Trail, Branson, MO 65616	(417) 338-2323	109	249	4.3	Lakefront condo resort with pool and boat slip rentals.	{WiFi,Pool,"Lake View","Boat Slip","Fitness Center",Parking}	\N	2.0	2026-03-02 22:54:17.873176+00
101	60	Temple Bar Marina Lodge	lodge	Temple Bar Rd, Temple Bar Marina, AZ 86443	(928) 767-3211	99	189	4.1	Remote lakeside lodge with marina and boat rentals.	{WiFi,Marina,"Boat Rental",Restaurant,"Lake View",Parking}	\N	0.2	2026-03-02 22:54:17.873176+00
102	60	Hoover Dam Lodge	hotel	18000 US-93, Boulder City, NV 89005	(702) 293-5000	79	159	4.0	Hotel near Hoover Dam with pool and restaurant.	{WiFi,Restaurant,Pool,Casino,Parking}	\N	8.0	2026-03-02 22:54:17.873176+00
103	62	Mill Falls at the Lake	resort	312 Daniel Webster Hwy, Meredith, NH 03253	(603) 279-7006	159	349	4.4	Lakefront resort with spa, restaurants, and boat cruises.	{WiFi,Restaurant,Spa,Pool,"Lake View","Boat Cruises"}	\N	0.5	2026-03-02 22:54:17.873176+00
104	62	Winnipesaukee Lakehouse	airbnb	567 Lakeshore Dr, Laconia, NH 03246	(603) 555-0178	175	375	4.7	Charming lakehouse with private dock and sandy beach.	{WiFi,Kitchen,"Private Dock",Beach,"Lake View",Kayaks,Grill}	\N	0.2	2026-03-02 22:54:17.873176+00
105	69	Gurney's Montauk Resort	resort	290 Old Montauk Hwy, Montauk, NY 11954	(631) 668-2345	299	699	4.5	Oceanfront resort with spa, beach, and fishing charter access.	{WiFi,Restaurant,Spa,Beach,Pool,"Ocean View","Fitness Center"}	\N	2.0	2026-03-02 22:54:17.873176+00
106	69	Montauk Manor	hotel	236 Edgemere St, Montauk, NY 11954	(631) 668-4400	179	399	4.3	Historic Tudor-style hotel with pool and ocean views.	{WiFi,Pool,"Ocean View",Tennis,Parking,Historic}	\N	3.0	2026-03-02 22:54:17.873176+00
107	69	Montauk Fishing Cottage	airbnb	123 Surfside Ave, Montauk, NY 11954	(631) 555-0134	195	425	4.6	Beachside cottage with fishing gear storage and outdoor shower.	{WiFi,Kitchen,"Beach Access","Fishing Gear Storage","Outdoor Shower",Deck}	\N	0.5	2026-03-02 22:54:17.873176+00
108	72	The Peninsula Yacht Club Hotel	hotel	18501 Harbor Light Blvd, Cornelius, NC 28031	(704) 892-9188	159	299	4.4	Lakefront hotel with marina access and stunning lake views.	{WiFi,Restaurant,Marina,Pool,"Lake View","Fitness Center"}	\N	1.0	2026-03-02 22:55:00.785453+00
109	73	Indian Hills Resort	resort	7360 Hwy 1804, Garrison, ND 58540	(701) 743-4122	89	179	4.3	Lakefront resort with cabins, marina, and fishing guides.	{WiFi,Marina,Cabins,"Guide Service","Fish Cleaning","Boat Rental"}	\N	0.5	2026-03-02 22:55:00.785453+00
110	77	Shangri-La Resort	resort	57301 E Hwy 125, Monkey Island, OK 74331	(918) 257-4204	139	299	4.4	Premier lakefront resort with golf, marina, and spa.	{WiFi,Restaurant,Golf,Marina,Pool,Spa,Tennis}	\N	1.0	2026-03-02 22:55:00.785453+00
111	77	Grand Lake Cabin Retreat	cabin	456 Lakeshore Rd, Grove, OK 74344	(918) 555-0189	99	199	4.5	Cozy lakefront cabin with dock and fire pit.	{WiFi,Kitchen,Dock,"Fire Pit","Lake View",Grill}	\N	0.3	2026-03-02 22:55:00.785453+00
112	80	Garibaldi House Inn	hotel	502 Garibaldi Ave, Garibaldi, OR 97118	(503) 322-3338	99	179	4.2	Waterfront hotel overlooking Tillamook Bay with fishing access.	{WiFi,"Bay View",Parking,"Fishing Access","Pet Friendly"}	\N	0.5	2026-03-02 22:55:00.785453+00
113	81	Sheraton Erie Bayfront Hotel	hotel	55 W Bay Dr, Erie, PA 16507	(814) 454-2005	139	269	4.3	Bayfront hotel with stunning views and easy access to Presque Isle.	{WiFi,Restaurant,Pool,"Bay View","Fitness Center",Parking}	\N	3.0	2026-03-02 22:55:00.785453+00
114	83	The 1661 Inn	hotel	1 Spring St, Block Island, RI 02807	(401) 466-2421	179	399	4.5	Historic oceanfront inn with panoramic ocean views.	{WiFi,Breakfast,"Ocean View",Garden,Parking}	\N	1.0	2026-03-02 22:55:00.785453+00
115	83	Block Island Beach House	airbnb	234 Corn Neck Rd, Block Island, RI 02807	(401) 555-0156	195	425	4.7	Beachfront house with private beach access and fishing gear.	{WiFi,Kitchen,"Beach Access","Fishing Gear","Ocean View",Deck}	\N	0.3	2026-03-02 22:55:00.785453+00
116	85	Timberlake Vacation Club	resort	1200 Marina Rd, Chapin, SC 29036	(803) 345-9015	119	249	4.3	Lakefront resort with marina, pool, and tennis.	{WiFi,Marina,Pool,Tennis,"Lake View","Boat Rental"}	\N	0.5	2026-03-02 22:55:00.785453+00
117	86	The Spectator Hotel	hotel	67 State St, Charleston, SC 29401	(843) 724-4326	249	499	4.7	Luxury boutique hotel in historic Charleston.	{WiFi,Restaurant,Concierge,"Valet Parking",Historic}	\N	2.0	2026-03-02 22:55:00.785453+00
118	86	Charleston Harbor Resort	resort	20 Patriots Point Rd, Mt Pleasant, SC 29464	(843) 856-0028	179	399	4.5	Waterfront resort with marina and harbor views.	{WiFi,Restaurant,Marina,Pool,"Harbor View",Spa}	\N	0.5	2026-03-02 22:55:00.785453+00
119	89	Deerfield Resort	resort	3787 Deerfield Way, LaFollette, TN 37766	(423) 566-0040	129	279	4.4	Lakefront resort with marina, pool, and mountain views.	{WiFi,Marina,Pool,"Mountain View","Boat Rental",Tennis}	\N	1.0	2026-03-02 22:55:00.785453+00
120	89	Norris Lake Cabin	cabin	567 Lakeview Rd, Rocky Top, TN 37769	(423) 555-0134	109	225	4.6	Private lakefront cabin with dock and hot tub.	{WiFi,Kitchen,Dock,"Hot Tub","Lake View","Fire Pit",Grill}	\N	0.3	2026-03-02 22:55:00.785453+00
121	95	Red Canyon Lodge	lodge	2450 W Red Canyon Lodge, Dutch John, UT 84023	(435) 889-3759	119	249	4.5	Rustic lodge near Flaming Gorge with fly fishing packages.	{WiFi,Restaurant,"Fly Shop","Guide Service","Horseback Riding",Parking}	\N	5.0	2026-03-02 22:55:00.785453+00
122	95	Flaming Gorge Resort	resort	1100 E Flaming Gorge Resort, Dutch John, UT 84023	(435) 889-3773	99	199	4.2	Resort with raft trips, boat rentals, and river access.	{WiFi,Restaurant,"Boat Rental","Raft Trips",Parking,"River Access"}	\N	3.0	2026-03-02 22:55:00.785453+00
123	96	Basin Harbor Resort	resort	4800 Basin Harbor Rd, Vergennes, VT 05491	(802) 475-2311	199	449	4.6	Historic lakefront resort with cottages, golf, and marina.	{WiFi,Restaurant,Golf,Marina,Pool,Tennis,"Lake View"}	\N	0.0	2026-03-02 22:55:00.785453+00
124	96	Hilton Burlington	hotel	60 Battery St, Burlington, VT 05401	(802) 658-6500	159	299	4.3	Downtown hotel with lake views and waterfront access.	{WiFi,Restaurant,Pool,"Lake View","Fitness Center",Parking}	\N	0.5	2026-03-02 22:55:00.785453+00
125	98	The Jefferson Hotel	hotel	101 W Franklin St, Richmond, VA 23220	(804) 649-4750	249	549	4.8	Iconic luxury hotel in downtown Richmond near the James River.	{WiFi,Restaurant,Pool,Spa,Concierge,"Valet Parking",Historic}	\N	2.0	2026-03-02 22:55:00.785453+00
126	99	Mariners Landing Resort	resort	1217 Graves Harbor Trail, Huddleston, VA 24104	(540) 297-4900	139	299	4.4	Lakefront resort with marina, golf, and mountain views.	{WiFi,Restaurant,Marina,Golf,Pool,"Mountain View"}	\N	0.5	2026-03-02 22:55:00.785453+00
127	99	Smith Mountain Lakehouse	airbnb	789 Lakeview Dr, Moneta, VA 24121	(540) 555-0167	175	375	4.7	Luxury lakehouse with private dock, hot tub, and game room.	{WiFi,Kitchen,"Private Dock","Hot Tub","Game Room","Lake View",Grill}	\N	0.2	2026-03-02 22:55:00.785453+00
128	101	Cannery Pier Hotel	hotel	10 Basin St, Astoria, OR 97103	(503) 325-4996	199	399	4.6	Luxury hotel built on a pier over the Columbia River.	{WiFi,Breakfast,"Hot Tub","River View",Bikes,"Wine Hour"}	\N	0.0	2026-03-02 22:55:00.785453+00
129	102	Adventures on the Gorge	resort	219 Chestnutburg Rd, Lansing, WV 25862	(304) 574-4900	99	249	4.5	Adventure resort with cabins, rafting, and fishing packages.	{WiFi,Restaurant,Cabins,Rafting,Fishing,"Zip Line",Pool}	\N	2.0	2026-03-02 22:55:00.785453+00
130	104	Best Western Premier Waterfront Hotel	hotel	1 N Main St, Oshkosh, WI 54901	(920) 230-1900	119	229	4.3	Waterfront hotel on Lake Winnebago with restaurant.	{WiFi,Restaurant,Pool,"Lake View","Fitness Center",Parking}	\N	0.5	2026-03-02 22:55:00.785453+00
131	106	Ramkota Hotel Casper	hotel	800 N Poplar St, Casper, WY 82601	(307) 266-6000	89	159	4.0	Full-service hotel near the North Platte River.	{WiFi,Restaurant,Pool,"Fitness Center",Parking}	\N	5.0	2026-03-02 22:55:00.785453+00
132	106	Platte River Cabin	cabin	234 River Bend Rd, Casper, WY 82601	(307) 555-0145	99	199	4.5	Riverside cabin with fly fishing access and mountain views.	{WiFi,Kitchen,"River Access","Mountain View","Fire Pit",Grill}	\N	1.0	2026-03-02 22:55:00.785453+00
133	107	Lake Yellowstone Hotel	hotel	Grand Loop Rd, Yellowstone National Park, WY 82190	(307) 344-7311	199	499	4.4	Historic hotel on the shores of Yellowstone Lake.	{WiFi,Restaurant,"Lake View",Historic,"Gift Shop"}	\N	0.0	2026-03-02 22:55:00.785453+00
134	107	Grant Village Lodge	lodge	Grand Loop Rd, Yellowstone National Park, WY 82190	(307) 344-7311	149	299	4.1	Lodge near Yellowstone Lake with dining and lake access.	{WiFi,Restaurant,"Lake View",Parking,"Gift Shop"}	\N	2.0	2026-03-02 22:55:00.785453+00
1	1	Lake Guntersville State Lodge	lodge	1155 Lodge Dr, Guntersville, AL 35976	(256) 571-5440	109	189	4.3	Lakefront lodge with stunning views, boat ramp access, and full-service restaurant .	{WiFi,Restaurant,"Boat Ramp",Pool,"Lake View"}	\N	0.5	2026-03-02 22:51:56.222976+00
\.


--
-- Data for Name: admins; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".admins (user_id, created_at) FROM stdin;
dd9c774b-9993-40ec-8e33-095e4f4a9b96	2026-09-29 11:23:25.624086+00
dcf38048-82c3-45d4-98fa-eacd2e81e8bf	2026-10-10 05:51:09.396949+00
\.


--
-- Data for Name: catch_log; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".catch_log (id, user_id, species, weight_lbs, length_inches, location, state, water_body, date, time_of_day, weather, method, lure_bait, photo_url, notes, is_personal_best, catch_and_release, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: catches; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".catches (id, user_id, spot_id, spot_name, fish_species, weight_lbs, length_inches, bait_lure, catch_date, catch_time, weather, photo_url, notes, created_at) FROM stdin;
\.


--
-- Data for Name: crm_appointments; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_appointments (id, calendar_id, contact_id, contact_email, contact_name, contact_phone, title, starts_at, ends_at, status, notes, source, google_event_id, calendly_event_id, assigned_user_id, assigned_membership_id, participant_count, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_availability; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_availability (id, calendar_id, day_of_week, start_time, end_time, is_active, created_at) FROM stdin;
195e7be2-7046-471b-9072-3bc0de7b387d	5b2e3914-5ae5-409f-8921-04216426c1f0	1	09:00:00	17:00:00	t	2026-04-24 23:51:48.506294+00
574e4a10-8321-4fac-9689-1be6351ded86	5b2e3914-5ae5-409f-8921-04216426c1f0	2	09:00:00	17:00:00	t	2026-04-24 23:51:48.506294+00
26f2ad7c-69e2-425e-9ffe-3743d161bfdb	5b2e3914-5ae5-409f-8921-04216426c1f0	3	09:00:00	17:00:00	t	2026-04-24 23:51:48.506294+00
6b4f20be-ad44-4e27-ac65-f09d7303c1c6	5b2e3914-5ae5-409f-8921-04216426c1f0	4	09:00:00	17:00:00	t	2026-04-24 23:51:48.506294+00
61f203e4-d4b5-4083-8aa0-626d2dd4cd65	5b2e3914-5ae5-409f-8921-04216426c1f0	5	09:00:00	17:00:00	t	2026-04-24 23:51:48.506294+00
\.


--
-- Data for Name: crm_calendar_members; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_calendar_members (id, calendar_id, user_id, user_google_calendar_id, priority, created_at, user_outlook_calendar_id) FROM stdin;
4883f470-8f9a-4876-9c7c-9a3b564fc3a1	5b2e3914-5ae5-409f-8921-04216426c1f0	696ad73e56cd643c6b3bc1e6	\N	0	2026-04-24 23:51:48.412283+00	\N
\.


--
-- Data for Name: crm_calendars; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_calendars (id, name, slug, description, calendar_type, owner_user_id, max_participants, date_range_days, slot_duration, slot_interval, max_bookings_per_day, min_notice_hours, buffer_before, buffer_after, timezone, is_active, meeting_location_type, meeting_location_value, google_calendar_id, google_refresh_token, calendly_user_uri, calendly_webhook_id, metadata, created_at, updated_at, calendly_connection_id, host_notify_on_booking) FROM stdin;
5b2e3914-5ae5-409f-8921-04216426c1f0	Default Calendar	\N	\N	personal	696ad73e56cd643c6b3bc1e6	1	\N	30	0	\N	1	0	0	America/New_York	t	custom	\N	\N	\N	\N	\N	{}	2026-04-24 23:51:48.323601+00	2026-04-24 23:51:48.323601+00	\N	t
\.


--
-- Data for Name: crm_calendly_connections; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_calendly_connections (id, user_id, calendly_user_uri, calendly_user_email, calendly_user_name, calendly_org_uri, encrypted_access_token, signing_key, webhook_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_campaigns; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_campaigns (id, name, subject, html_body, text_body, status, list_id, filter_query, list_ids, style_preset, images, scheduled_at, sent_at, total_recipients, total_sent, total_opened, total_clicked, created_at, channel, goal_id) FROM stdin;
\.


--
-- Data for Name: crm_contact_lists; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_contact_lists (id, contact_id, list_id, created_at) FROM stdin;
\.


--
-- Data for Name: crm_contacts; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_contacts (id, email, name, phone, sms_opt_in, address, source, tags, metadata, ecom_customer_id, total_orders, total_spent, last_order_at, subscribed, subscribed_at, unsubscribed_at, created_at, updated_at, first_order_at, purchased_product_ids, purchased_product_names) FROM stdin;
\.


--
-- Data for Name: crm_events; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_events (id, contact_id, campaign_id, event_type, metadata, created_at, channel, goal_id, flow_id, send_id, event_key) FROM stdin;
\.


--
-- Data for Name: crm_flow_logs; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_flow_logs (id, flow_id, step_id, contact_id, trigger_event, status, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: crm_flow_step_queue; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_flow_step_queue (id, flow_id, contact_id, resume_step_order, run_at, attempts, max_attempts, last_error, event_data, locked_at, locked_by, finished_at, created_at) FROM stdin;
\.


--
-- Data for Name: crm_flow_steps; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_flow_steps (id, flow_id, step_order, action_type, action_config, created_at) FROM stdin;
\.


--
-- Data for Name: crm_flows; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_flows (id, name, trigger_type, trigger_config, is_active, created_at, updated_at, cron_job_name, last_fired_at, goal_id) FROM stdin;
48214892-30af-4bb8-8ae8-e8cc8b8e641c	Welcome Email	contact.subscribed	{}	f	2026-04-20 00:16:10.42928+00	2026-04-20 00:16:10.42928+00	\N	\N	\N
\.


--
-- Data for Name: crm_goal_actions; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_goal_actions (id, goal_id, action_type, target_table, target_id, status, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: crm_goal_contacts; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_goal_contacts (id, goal_id, contact_id, status, conversation_state, matched_at, last_touched_at, converted_at, conversion_reason, messages_sent, replies_received, insights, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_goal_runs; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_goal_runs (id, goal_id, run_type, status, selection_stats, processing_stats, metadata, error, started_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: crm_goal_work; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_goal_work (id, goal_id, kind, payload, status, not_before, attempts, max_attempts, last_error, locked_at, locked_by, finished_at, created_at) FROM stdin;
\.


--
-- Data for Name: crm_goals; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_goals (id, objective_text, status, category, tags, config, success_criteria, plan, rules, instructions, sender, created_by, last_run_at, last_processed_at, last_contact_match_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_lists; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_lists (id, name, description, filter_query, is_dynamic, created_at, goal_id) FROM stdin;
\.


--
-- Data for Name: crm_opportunities; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_opportunities (id, contact_id, pipeline_id, stage_id, title, value_cents, currency, status, "position", source, description, metadata, won_at, lost_at, lost_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_opportunity_events; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_opportunity_events (id, opportunity_id, contact_id, pipeline_id, from_stage_id, to_stage_id, event_type, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: crm_pipeline_stages; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_pipeline_stages (id, pipeline_id, name, "position", type, color, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_pipelines; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_pipelines (id, name, "position", is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: crm_sends; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".crm_sends (id, goal_id, campaign_id, flow_id, contact_id, direction, source, created_by, status, to_email, from_email, subject, body, draft_body, approved_by, approved_at, mailgun_message_id, in_reply_to, thread_references, idempotency_key, error, metadata, sent_at, locked_at, locked_by, attempts, max_attempts, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: favorites; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".favorites (id, user_id, spot_id, created_at) FROM stdin;
\.


--
-- Data for Name: fishing_licenses; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".fishing_licenses (id, state, state_abbr, resident_annual_cost, non_resident_annual_cost, resident_daily_cost, non_resident_daily_cost, youth_exemption_age, senior_exemption_age, senior_discount_pct, free_fishing_days, agency_name, agency_url, purchase_url, notes, freshwater_endorsement, saltwater_endorsement, trout_stamp_required, trout_stamp_cost, updated_at, created_at) FROM stdin;
1	Alabama	AL	13.60	51.30	6.35	11.35	16	65	50	First Saturday in June	Alabama Dept. of Conservation & Natural Resources	https://www.outdooralabama.com	https://www.outdooralabama.com/licenses	Saltwater endorsement required for saltwater fishing.	f	t	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
2	Alaska	AK	29.00	145.00	15.00	25.00	16	\N	0	None designated	Alaska Dept. of Fish and Game	https://www.adfg.alaska.gov	https://www.adfg.alaska.gov/index.cfm?adfg=license.main	King salmon stamp required for king salmon fishing.	f	f	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
3	Arizona	AZ	37.00	55.00	16.00	26.00	10	70	100	First Saturday in June	Arizona Game and Fish Department	https://www.azgfd.com	https://www.azgfd.com/License/	Urban fishing license available for $24. Trout stamp required for trout.	f	f	t	24.75	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
4	Arkansas	AR	10.50	50.00	7.00	16.00	16	65	100	First weekend in June	Arkansas Game and Fish Commission	https://www.agfc.com	https://www.agfc.com/en/licensing/	Trout permit required for trout fishing in designated waters.	f	f	t	10.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
5	California	CA	54.00	142.05	17.54	27.84	16	65	25	Two free fishing days per year	California Dept. of Fish and Wildlife	https://wildlife.ca.gov	https://wildlife.ca.gov/Licensing	Separate ocean enhancement stamp for ocean fishing. Report card required for steelhead.	f	t	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
6	Colorado	CO	35.17	96.67	14.17	21.17	16	64	50	First weekend in June	Colorado Parks and Wildlife	https://cpw.state.co.us	https://cpw.state.co.us/buyapply/Pages/Fishing.aspx	Habitat stamp ($10.40) required in addition to fishing license.	f	f	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
7	Connecticut	CT	22.00	55.00	10.00	15.00	16	65	100	Third Saturday in June	Connecticut DEEP	https://portal.ct.gov/DEEP	https://portal.ct.gov/DEEP/Fishing/Fishing-License-Information	Trout and salmon stamp required for trout/salmon fishing.	f	t	t	5.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
8	Delaware	DE	8.50	20.00	5.00	8.50	16	65	100	First Saturday in June	Delaware Division of Fish & Wildlife	https://dnrec.alpha.delaware.gov/fish-wildlife/	https://dnrec.alpha.delaware.gov/fish-wildlife/licenses/	Trout stamp required for trout fishing.	f	t	t	4.20	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
9	Florida	FL	17.00	47.00	7.00	17.00	16	65	100	Four free fishing days per year	Florida Fish and Wildlife Conservation Commission	https://myfwc.com	https://myfwc.com/license/	Separate saltwater and freshwater licenses available. Snook and lobster permits extra.	t	t	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
10	Georgia	GA	15.00	50.00	3.50	7.00	16	65	100	First Saturday in June	Georgia Dept. of Natural Resources	https://gadnr.org	https://gadnr.org/fishing-licenses	Trout stamp required for trout fishing in designated waters.	f	f	t	5.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
11	Hawaii	HI	5.00	25.00	3.00	10.00	15	65	100	First Saturday in June	Hawaii Division of Aquatic Resources	https://dlnr.hawaii.gov/dar/	https://dlnr.hawaii.gov/dar/fishing/fishing-licenses/	Freshwater fishing license required. No license needed for most saltwater fishing.	t	f	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
12	Idaho	ID	30.75	98.75	14.75	18.75	14	\N	0	Free Fishing Day in June	Idaho Fish and Game	https://idfg.idaho.gov	https://idfg.idaho.gov/licenses	Steelhead and salmon permits required separately.	f	f	t	15.75	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
13	Illinois	IL	15.00	31.50	5.50	11.50	16	65	100	First weekend in June	Illinois Dept. of Natural Resources	https://www2.illinois.gov/dnr	https://www2.illinois.gov/dnr/fishing/Pages/default.aspx	Inland trout stamp and salmon stamp available separately.	f	f	t	6.50	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
14	Indiana	IN	17.00	35.00	9.00	9.00	18	65	100	First weekend in June	Indiana Dept. of Natural Resources	https://www.in.gov/dnr/	https://www.in.gov/dnr/fish-and-wildlife/fishing/fishing-licenses/	Trout/salmon stamp required for designated waters.	f	f	t	11.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
15	Iowa	IA	22.00	48.00	9.50	13.50	16	65	100	First weekend in June	Iowa Dept. of Natural Resources	https://www.iowadnr.gov	https://www.iowadnr.gov/Fishing/Fishing-Licenses	Trout fee required for trout fishing in designated areas.	f	f	t	13.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
16	Kansas	KS	27.50	52.50	7.50	12.50	16	65	50	First weekend in June	Kansas Dept. of Wildlife & Parks	https://ksoutdoors.com	https://ksoutdoors.com/Fishing/Fishing-Licenses	Trout permit required for designated trout waters.	f	f	t	14.50	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
17	Kentucky	KY	23.00	55.00	7.00	15.00	16	65	100	First weekend in June	Kentucky Dept. of Fish & Wildlife Resources	https://fw.ky.gov	https://fw.ky.gov/Pages/default.aspx	Trout permit required for trout fishing.	f	f	t	10.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
18	Louisiana	LA	9.50	60.00	5.00	15.00	16	60	100	First Saturday in June	Louisiana Dept. of Wildlife and Fisheries	https://www.wlf.louisiana.gov	https://www.wlf.louisiana.gov/page/recreational-fishing	Saltwater license required in addition to basic license for saltwater fishing.	t	t	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
19	Maine	ME	25.00	64.00	11.00	11.00	16	65	100	Free Fishing Weekend in February and June	Maine Dept. of Inland Fisheries & Wildlife	https://www.maine.gov/ifw/	https://www.maine.gov/ifw/fishing-wildlife/fishing/index.html	Separate licenses for freshwater and saltwater.	t	t	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
20	Maryland	MD	20.50	30.50	7.00	7.00	16	65	100	First two Saturdays in June and July 4th	Maryland Dept. of Natural Resources	https://dnr.maryland.gov	https://dnr.maryland.gov/fisheries/Pages/license.aspx	Chesapeake Bay sport fishing license required for tidal waters. Trout stamp for trout.	f	t	t	5.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
21	Massachusetts	MA	27.50	37.50	8.50	12.50	15	65	100	Free Freshwater Fishing Weekend in June	Massachusetts Division of Fisheries & Wildlife	https://www.mass.gov/orgs/division-of-fisheries-and-wildlife	https://www.mass.gov/how-to/buy-a-fishing-license	No license required for saltwater fishing. Freshwater trout stamp available.	f	f	t	11.50	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
22	Michigan	MI	26.00	76.00	10.00	30.00	17	65	50	Two free fishing weekends per year	Michigan Dept. of Natural Resources	https://www.michigan.gov/dnr	https://www.michigan.gov/dnr/buy-and-apply/fishing	All-species license covers all fish. Separate licenses for restricted species.	f	f	f	\N	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
23	Minnesota	MN	25.00	51.00	12.00	15.00	16	90	100	Free Fishing Weekend in June	Minnesota Dept. of Natural Resources	https://www.dnr.state.mn.us	https://www.dnr.state.mn.us/fishing/index.html	Trout stamp required for trout and salmon fishing.	f	f	t	10.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
24	Mississippi	MS	8.00	30.00	5.00	10.00	16	65	100	First Saturday in June	Mississippi Dept. of Wildlife, Fisheries & Parks	https://www.mdwfp.com	https://www.mdwfp.com/license/	Saltwater license available separately. Trout permit for trout waters.	t	t	t	7.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
25	Missouri	MO	12.00	42.00	7.00	14.00	16	65	100	First weekend in June	Missouri Dept. of Conservation	https://mdc.mo.gov	https://mdc.mo.gov/fishing/permits	Trout permit required for trout fishing in designated areas.	f	f	t	7.00	2026-03-04 22:41:53.490784+00	2026-03-04 22:41:53.490784+00
26	Montana	MT	20.25	86.25	12.50	25.00	12	62	50	Free Fishing Weekend in June	Montana Fish, Wildlife & Parks	https://fwp.mt.gov	https://fwp.mt.gov/buyandapply/fishing	Conservation license required in addition to fishing license.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
27	Nebraska	NE	29.00	56.00	10.00	16.00	16	65	100	First weekend in June	Nebraska Game and Parks Commission	https://outdoornebraska.gov	https://outdoornebraska.gov/fishing/	Aquatic habitat stamp required. Trout stamp for trout waters.	f	f	t	12.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
28	Nevada	NV	40.00	80.00	18.00	21.00	12	65	50	Free Fishing Day in June	Nevada Dept. of Wildlife	https://www.ndow.org	https://www.ndow.org/licensing/	Trout stamp required for trout fishing.	f	f	t	10.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
29	New Hampshire	NH	25.00	53.00	10.00	15.00	16	68	100	Free Fishing Day in June	New Hampshire Fish and Game	https://www.wildlife.nh.gov	https://www.wildlife.nh.gov/fishing/licenses	Saltwater license not required. Freshwater license covers all freshwater species.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
30	New Jersey	NJ	22.50	34.00	9.00	12.00	16	70	100	Two free fishing days per year	New Jersey Division of Fish & Wildlife	https://www.nj.gov/dep/fgw/	https://www.nj.gov/dep/fgw/fishing.htm	Trout stamp required for trout fishing. Saltwater registry required.	f	t	t	10.50	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
31	New Mexico	NM	25.00	56.00	12.00	24.00	12	70	100	First Saturday in June	New Mexico Dept. of Game & Fish	https://www.wildlife.state.nm.us	https://www.wildlife.state.nm.us/fishing/	Habitat management and access validation required.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
32	New York	NY	25.00	50.00	10.00	15.00	16	70	100	Free Fishing Weekend in June and November	New York Dept. of Environmental Conservation	https://www.dec.ny.gov	https://www.dec.ny.gov/permits/6091.html	Trout and salmon stamp for trout/salmon fishing. Marine registry for saltwater.	f	t	t	10.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
33	North Carolina	NC	25.00	45.00	7.00	13.00	16	65	100	First Saturday in July	North Carolina Wildlife Resources Commission	https://www.ncwildlife.org	https://www.ncwildlife.org/Licensing	Trout license required for trout fishing. Coastal recreational fishing license for saltwater.	t	t	t	15.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
34	North Dakota	ND	16.00	46.00	8.00	12.00	16	65	100	First weekend in June	North Dakota Game and Fish Dept.	https://gf.nd.gov	https://gf.nd.gov/licensing	Paddlefish tag available by lottery only.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
35	Ohio	OH	25.00	40.00	11.00	11.00	16	66	100	First weekend in May	Ohio Dept. of Natural Resources	https://ohiodnr.gov	https://ohiodnr.gov/buy-and-apply/fishing-license	Lake Erie permit required for Lake Erie fishing.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
36	Oklahoma	OK	25.00	55.00	8.00	14.00	16	65	100	First Saturday in June	Oklahoma Dept. of Wildlife Conservation	https://www.wildlifedepartment.com	https://www.wildlifedepartment.com/fishing/licenses	Paddlefish permit required separately.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
37	Oregon	OR	44.00	107.50	20.75	26.75	12	70	50	Free Fishing Weekend in June	Oregon Dept. of Fish and Wildlife	https://www.dfw.state.or.us	https://www.dfw.state.or.us/resources/fishing/	Combined angling tag covers most species. Separate tags for salmon/steelhead.	f	t	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
38	Pennsylvania	PA	22.97	52.97	11.97	26.97	16	65	100	Free Fishing Days in May and July	Pennsylvania Fish and Boat Commission	https://www.fishandboat.com	https://www.fishandboat.com/Fish/FishingLicenses/Pages/default.aspx	Trout/salmon permit and Lake Erie permit available separately.	f	f	t	9.97	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
39	Rhode Island	RI	18.00	35.00	5.00	10.00	15	65	100	Free Fishing Day in June	Rhode Island DEM Division of Fish & Wildlife	https://dem.ri.gov/natural-resources-bureau/fish-wildlife	https://dem.ri.gov/natural-resources-bureau/fish-wildlife/freshwater-fisheries/fishing-licenses	Saltwater license free for residents. Trout stamp for trout fishing.	f	t	t	5.50	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
40	South Carolina	SC	10.00	35.00	5.00	11.00	16	65	100	First Saturday in June	South Carolina Dept. of Natural Resources	https://www.dnr.sc.gov	https://www.dnr.sc.gov/licensing.html	Saltwater license required separately.	t	t	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
41	South Dakota	SD	28.00	69.00	10.00	18.00	16	65	100	Free Fishing Weekend in May	South Dakota Game, Fish and Parks	https://gfp.sd.gov	https://gfp.sd.gov/fishing/	Paddlefish tag available by lottery.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
42	Tennessee	TN	28.00	50.00	6.50	10.50	13	65	100	Free Fishing Day in June	Tennessee Wildlife Resources Agency	https://www.tn.gov/twra	https://www.tn.gov/twra/license-sales.html	Trout stamp required for trout fishing. Type 30 all-species license available.	f	f	t	12.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
43	Texas	TX	30.00	58.00	11.00	16.00	17	65	100	First Saturday in June	Texas Parks and Wildlife Department	https://tpwd.texas.gov	https://tpwd.texas.gov/business/licenses/	Freshwater and saltwater endorsements available. Red drum tag for red drum.	t	t	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
44	Utah	UT	34.00	75.00	12.00	16.00	12	65	50	Free Fishing Day in June	Utah Division of Wildlife Resources	https://wildlife.utah.gov	https://wildlife.utah.gov/fishing-in-utah.html	Second rod permit available. Colorado River cutthroat trout catch-and-release only.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
45	Vermont	VT	28.00	53.00	10.00	15.00	15	65	100	Free Fishing Day in June	Vermont Fish & Wildlife Dept.	https://vtfishandwildlife.com	https://vtfishandwildlife.com/fish/fishing-licenses-and-laws	No separate trout stamp needed. License covers all freshwater species.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
46	Virginia	VA	23.00	47.00	7.00	12.00	16	65	100	First weekend in June	Virginia Dept. of Wildlife Resources	https://dwr.virginia.gov	https://dwr.virginia.gov/fishing/regulations/	Trout license required for designated trout waters. Saltwater license separate.	t	t	t	12.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
47	Washington	WA	30.05	84.50	11.35	20.15	15	70	50	Free Fishing Weekend in June	Washington Dept. of Fish and Wildlife	https://wdfw.wa.gov	https://wdfw.wa.gov/licenses	Catch record card required for salmon, steelhead, sturgeon, and halibut.	f	t	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
48	West Virginia	WV	19.00	37.00	5.00	10.00	15	65	100	First weekend in June	West Virginia Division of Natural Resources	https://wvdnr.gov	https://wvdnr.gov/fishing/	Trout stamp required for trout fishing. National Forest stamp for certain areas.	f	f	t	10.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
49	Wisconsin	WI	20.00	50.00	10.00	15.00	16	65	100	Free Fishing Weekend in June	Wisconsin Dept. of Natural Resources	https://dnr.wisconsin.gov	https://dnr.wisconsin.gov/topic/Fishing/licenses	Inland trout stamp and Great Lakes salmon/trout stamp available separately.	f	f	t	10.00	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
50	Wyoming	WY	27.00	102.00	14.00	24.00	14	65	50	Free Fishing Day in June	Wyoming Game and Fish Dept.	https://wgfd.wyo.gov	https://wgfd.wyo.gov/Apply-or-Buy/Fishing	Conservation stamp required in addition to fishing license.	f	f	f	\N	2026-03-04 22:42:31.104915+00	2026-03-04 22:42:31.104915+00
\.


--
-- Data for Name: fishing_regulations; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".fishing_regulations (id, state, state_abbr, species, daily_bag_limit, possession_limit, size_limit_inches, slot_limit_min, slot_limit_max, season_open, season_close, season_notes, special_rules, water_body_type, water_body_name, catch_and_release_only, artificial_lures_only, barbless_hooks_required, updated_at) FROM stdin;
1	Alabama	AL	Largemouth Bass	10	\N	14.0	\N	\N	Year-round	\N	\N	No more than 5 fish over 14 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
2	Alabama	AL	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate of black and white crappie	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
3	Alabama	AL	Channel Catfish	15	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
4	Alabama	AL	Striped Bass	4	\N	20.0	\N	\N	Year-round	\N	Check specific reservoir rules	Varies by reservoir; some have slot limits	freshwater	Reservoirs	f	f	f	2026-03-07 19:04:40.339726+00
5	Alabama	AL	Red Snapper	2	\N	16.0	\N	\N	June 1	July 31	Federal season may differ	Must have reef fish endorsement	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:04:40.339726+00
6	Alabama	AL	Spotted Seatrout	6	\N	15.0	\N	\N	Year-round	\N	\N	Only 1 fish over 24 inches allowed	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
7	Alaska	AK	King Salmon	1	\N	\N	\N	\N	May 15	July 31	Varies by river system	King salmon stamp required; varies by drainage	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
8	Alaska	AK	Sockeye Salmon	6	\N	\N	\N	\N	June 1	September 30	Peak run varies by river	Check emergency orders for closures	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
9	Alaska	AK	Rainbow Trout	2	\N	\N	\N	\N	Year-round	\N	Some rivers catch-and-release only	Trophy waters have special restrictions	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
10	Alaska	AK	Halibut	2	\N	\N	\N	\N	February 1	December 31	Charter limits may differ	One fish any size, one under 28 inches	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
11	Alaska	AK	Arctic Grayling	5	\N	12.0	\N	\N	Year-round	\N	\N	Single hook artificial lures only in some areas	freshwater	\N	f	t	f	2026-03-07 19:04:40.339726+00
12	Arizona	AZ	Largemouth Bass	6	\N	13.0	\N	\N	Year-round	\N	\N	Slot limit on some lakes	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
13	Arizona	AZ	Rainbow Trout	6	\N	\N	\N	\N	Year-round	\N	Stocked regularly in winter	No bait allowed in some streams	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
14	Arizona	AZ	Channel Catfish	10	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
15	Arizona	AZ	Walleye	6	\N	16.0	\N	\N	Year-round	\N	\N	Check specific lake regulations	freshwater	Lakes	f	f	f	2026-03-07 19:04:40.339726+00
16	California	CA	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	Some lakes have seasonal closures	Check district-specific regulations	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
17	California	CA	Rainbow Trout	5	\N	\N	\N	\N	Last Saturday in April	November 15	Varies by district	Barbless hooks required in some waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
18	California	CA	Striped Bass	2	\N	18.0	\N	\N	Year-round	\N	\N	Sacramento-San Joaquin Delta special rules	freshwater	Sacramento Delta	f	f	f	2026-03-07 19:04:40.339726+00
19	California	CA	Halibut	5	\N	22.0	\N	\N	Year-round	\N	\N	Must be measured flat	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
20	California	CA	Rockfish	10	\N	\N	\N	\N	April 1	December 31	Depth restrictions apply	Aggregate limit; check depth closures	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
21	California	CA	Steelhead	0	\N	\N	\N	\N	Year-round	\N	Wild steelhead must be released	Hatchery fish only; steelhead report card required	freshwater	Rivers	t	f	t	2026-03-07 19:04:40.339726+00
22	Colorado	CO	Rainbow Trout	4	\N	\N	\N	\N	Year-round	\N	\N	Varies by water; Gold Medal waters have special rules	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
23	Colorado	CO	Brown Trout	4	\N	\N	\N	\N	Year-round	\N	\N	Aggregate with rainbow trout	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
24	Colorado	CO	Kokanee Salmon	10	\N	\N	\N	\N	Year-round	\N	Snagging allowed during spawn in some waters	Check specific reservoir rules	freshwater	Reservoirs	f	f	f	2026-03-07 19:04:40.339726+00
25	Colorado	CO	Walleye	5	\N	15.0	\N	\N	Year-round	\N	\N	Some reservoirs have slot limits	freshwater	Reservoirs	f	f	f	2026-03-07 19:04:40.339726+00
26	Colorado	CO	Largemouth Bass	5	\N	15.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
27	Florida	FL	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	Only 1 fish over 22 inches per day	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
28	Florida	FL	Crappie	25	\N	\N	\N	\N	Year-round	\N	\N	Aggregate of black and white crappie	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
29	Florida	FL	Red Drum	1	\N	18.0	\N	27.0	Year-round	\N	\N	Slot limit 18-27 inches; must be released if over 27	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
30	Florida	FL	Snook	1	\N	28.0	\N	33.0	September 1	December 14	Closed season varies by coast	Slot limit 28-33 inches; snook permit required	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
31	Florida	FL	Spotted Seatrout	4	\N	15.0	\N	20.0	Year-round	\N	\N	Slot limit 15-20 inches; only 1 over 20 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
32	Florida	FL	Red Snapper	2	\N	16.0	\N	\N	June 1	July 31	Short federal season	Must have reef fish endorsement	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:04:40.339726+00
33	Florida	FL	Peacock Bass	2	\N	17.0	\N	\N	Year-round	\N	\N	Only 1 over 17 inches; no live bait	freshwater	South Florida Canals	f	f	f	2026-03-07 19:04:40.339726+00
34	Georgia	GA	Largemouth Bass	10	\N	14.0	\N	\N	Year-round	\N	\N	No more than 5 over 14 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
35	Georgia	GA	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
36	Georgia	GA	Striped Bass	2	\N	22.0	\N	\N	Year-round	\N	Varies by lake	Check specific lake regulations	freshwater	Lakes	f	f	f	2026-03-07 19:04:40.339726+00
37	Georgia	GA	Rainbow Trout	8	\N	\N	\N	\N	Year-round	\N	Stocked in North Georgia	Delayed harvest streams are catch-and-release Nov-May	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
38	Georgia	GA	Red Drum	5	\N	14.0	\N	23.0	Year-round	\N	\N	Slot limit 14-23 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
39	Idaho	ID	Rainbow Trout	6	\N	\N	\N	\N	Year-round	\N	Varies by water	Check specific water regulations	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
40	Idaho	ID	Steelhead	3	\N	20.0	\N	\N	August 15	April 30	Hatchery fish only	Must have steelhead permit; adipose fin clipped	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
41	Idaho	ID	Chinook Salmon	6	\N	\N	\N	\N	Varies	\N	Highly variable by river	Check emergency closures; permit required	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
42	Idaho	ID	Smallmouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
43	Illinois	IL	Largemouth Bass	6	\N	14.0	\N	\N	Year-round	\N	\N	Catch-and-release only in some urban ponds	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
44	Illinois	IL	Bluegill	25	\N	\N	\N	\N	Year-round	\N	\N	Aggregate with other sunfish	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
45	Illinois	IL	Channel Catfish	6	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
46	Illinois	IL	Walleye	6	\N	14.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
47	Illinois	IL	Muskie	1	\N	36.0	\N	\N	Year-round	\N	\N	Minimum 36 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
48	Louisiana	LA	Largemouth Bass	10	\N	14.0	\N	\N	Year-round	\N	\N	No more than 5 over 14 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
49	Louisiana	LA	Red Drum	5	\N	16.0	\N	27.0	Year-round	\N	\N	Slot limit 16-27 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
50	Louisiana	LA	Spotted Seatrout	25	\N	12.0	\N	\N	Year-round	\N	\N	Only 1 fish over 25 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
51	Louisiana	LA	Crappie	50	\N	\N	\N	\N	Year-round	\N	\N	Aggregate of black and white crappie	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
52	Louisiana	LA	Flounder	10	\N	12.0	\N	\N	Year-round	\N	Closed season in November	Check current closure dates	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
53	Michigan	MI	Walleye	5	\N	15.0	\N	\N	May 15	March 15	Catch-and-release in April-May	Varies by lake; check specific regulations	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
54	Michigan	MI	Largemouth Bass	5	\N	14.0	\N	\N	Last Saturday in May	December 31	Catch-and-release in off-season	Some lakes have different size limits	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
55	Michigan	MI	Yellow Perch	25	\N	\N	\N	\N	Year-round	\N	\N	Popular ice fishing species	freshwater	Great Lakes	f	f	f	2026-03-07 19:04:40.339726+00
56	Michigan	MI	Lake Trout	3	\N	15.0	\N	\N	Year-round	\N	Varies by Great Lake	Check specific Great Lake regulations	freshwater	Great Lakes	f	f	f	2026-03-07 19:04:40.339726+00
57	Michigan	MI	Steelhead	3	\N	\N	\N	\N	Year-round	\N	\N	Must have all-species license	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
58	Michigan	MI	Muskie	1	\N	42.0	\N	\N	First Saturday in June	December 15	\N	Minimum 42 inches; trophy fishery	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
59	Minnesota	MN	Walleye	4	\N	15.0	\N	\N	May 15	February 28	Ice fishing season included	Varies by lake; some have slot limits	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
60	Minnesota	MN	Northern Pike	3	\N	24.0	\N	\N	May 15	February 28	\N	Only 1 over 36 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
61	Minnesota	MN	Largemouth Bass	6	\N	14.0	\N	\N	May 25	February 28	Catch-and-release before opener	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
62	Minnesota	MN	Muskie	1	\N	54.0	\N	\N	June 1	December 1	\N	Minimum 54 inches; catch-and-release encouraged	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
63	Minnesota	MN	Crappie	10	\N	\N	\N	\N	Year-round	\N	\N	Aggregate of black and white crappie	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
64	Montana	MT	Rainbow Trout	5	\N	\N	\N	\N	Third Saturday in May	November 30	Varies by river	Combined trout limit; check specific waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
65	Montana	MT	Brown Trout	5	\N	\N	\N	\N	Third Saturday in May	November 30	\N	Combined with rainbow trout limit	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
66	Montana	MT	Cutthroat Trout	3	\N	\N	\N	\N	Third Saturday in May	November 30	\N	Catch-and-release on some rivers	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
67	Montana	MT	Walleye	10	\N	\N	\N	\N	Year-round	\N	\N	No minimum size on most waters	freshwater	Reservoirs	f	f	f	2026-03-07 19:04:40.339726+00
68	Montana	MT	Northern Pike	10	\N	\N	\N	\N	Year-round	\N	\N	No limit on some waters to control population	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
69	New York	NY	Largemouth Bass	5	\N	12.0	\N	\N	Third Saturday in June	November 30	Catch-and-release Dec-June	Varies by region	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
70	New York	NY	Walleye	5	\N	18.0	\N	\N	First Saturday in May	March 15	\N	Varies by water body	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
71	New York	NY	Rainbow Trout	5	\N	9.0	\N	\N	April 1	October 15	Varies by region	Aggregate trout limit	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
72	New York	NY	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Slot limit 28-35 inches in some areas	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:04:40.339726+00
73	New York	NY	Fluke	4	\N	19.0	\N	\N	May 1	September 30	\N	Check current year size limit	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:04:40.339726+00
74	New York	NY	Muskie	1	\N	36.0	\N	\N	First Saturday in May	March 15	\N	Minimum 36 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
75	North Carolina	NC	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	No more than 2 over 14 inches on some waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
76	North Carolina	NC	Rainbow Trout	7	\N	\N	\N	\N	Year-round	\N	Stocked waters have different rules	Hatchery supported waters: 7 per day	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
77	North Carolina	NC	Red Drum	1	\N	18.0	\N	27.0	Year-round	\N	\N	Slot limit 18-27 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
78	North Carolina	NC	Striped Bass	4	\N	18.0	\N	\N	Year-round	\N	Varies by water	Check specific lake or river regulations	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
79	North Carolina	NC	Flounder	4	\N	15.0	\N	\N	Year-round	\N	Season closures possible	Check current regulations	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
80	Oregon	OR	Rainbow Trout	5	\N	8.0	\N	\N	Year-round	\N	Varies by water	Combined trout limit; check specific waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
81	Oregon	OR	Chinook Salmon	2	\N	24.0	\N	\N	Varies	\N	Highly variable by river	Check ODFW regulations for specific rivers	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
82	Oregon	OR	Steelhead	2	\N	20.0	\N	\N	Varies	\N	Hatchery fish only on most rivers	Must have combined angling tag	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
83	Oregon	OR	Smallmouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	No limit on some rivers	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
84	Oregon	OR	Lingcod	2	\N	22.0	\N	\N	March 1	October 31	\N	Check marine zone regulations	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
85	Oregon	OR	Dungeness Crab	12	\N	\N	\N	\N	Year-round	\N	Males only	Must be 5.75 inch minimum carapace width	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
86	Pennsylvania	PA	Largemouth Bass	6	\N	12.0	\N	\N	June 15	April 15	Catch-and-release in spring	Varies by water	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
87	Pennsylvania	PA	Rainbow Trout	5	\N	7.0	\N	\N	April 1	February 28	Stocked waters	Mentored youth day in March	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
88	Pennsylvania	PA	Walleye	6	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	Lakes	f	f	f	2026-03-07 19:04:40.339726+00
89	Pennsylvania	PA	Muskie	1	\N	40.0	\N	\N	Year-round	\N	\N	Minimum 40 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
90	Pennsylvania	PA	Steelhead	3	\N	15.0	\N	\N	Year-round	\N	Lake Erie tributaries	Trout/salmon stamp required	freshwater	Lake Erie Tributaries	f	f	f	2026-03-07 19:04:40.339726+00
91	Texas	TX	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	No more than 5 per day; 14 inch minimum	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
92	Texas	TX	Crappie	25	\N	10.0	\N	\N	Year-round	\N	\N	10 inch minimum on most waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
93	Texas	TX	Channel Catfish	25	\N	12.0	\N	\N	Year-round	\N	\N	No minimum on some waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
94	Texas	TX	Red Drum	3	\N	20.0	\N	28.0	Year-round	\N	\N	Slot limit 20-28 inches; 1 over 28 per day with tag	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:04:40.339726+00
95	Texas	TX	Spotted Seatrout	5	\N	15.0	\N	25.0	Year-round	\N	\N	Slot limit 15-25 inches; only 1 over 25	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:04:40.339726+00
96	Texas	TX	Flounder	5	\N	14.0	\N	\N	Year-round	\N	November closure possible	Check current gigging regulations	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:04:40.339726+00
97	Texas	TX	Alligator Gar	1	\N	48.0	\N	\N	Year-round	\N	\N	Must have special tag; 48 inch minimum	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
98	Virginia	VA	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	Varies by water body	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
99	Virginia	VA	Rainbow Trout	6	\N	\N	\N	\N	Year-round	\N	Stocked waters	Designated stocked trout waters require license	freshwater	Streams	f	f	f	2026-03-07 19:04:40.339726+00
100	Virginia	VA	Striped Bass	2	\N	20.0	\N	\N	Year-round	\N	Varies by water	Check Chesapeake Bay specific regulations	saltwater	Chesapeake Bay	f	f	f	2026-03-07 19:04:40.339726+00
101	Virginia	VA	Red Drum	3	\N	18.0	\N	26.0	Year-round	\N	\N	Slot limit 18-26 inches	saltwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
102	Virginia	VA	Muskie	2	\N	30.0	\N	\N	Year-round	\N	\N	Minimum 30 inches; New River special regulations	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
103	Washington	WA	Rainbow Trout	5	\N	8.0	\N	\N	Year-round	\N	Varies by water	Combined trout limit; check specific waters	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
104	Washington	WA	Chinook Salmon	2	\N	24.0	\N	\N	Varies	\N	Highly variable by river	Check WDFW emergency rules	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
105	Washington	WA	Steelhead	2	\N	20.0	\N	\N	Varies	\N	Hatchery fish only on most rivers	Catch record card required	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
106	Washington	WA	Walleye	8	\N	\N	\N	\N	Year-round	\N	\N	No minimum size on Columbia River	freshwater	Columbia River	f	f	f	2026-03-07 19:04:40.339726+00
107	Washington	WA	Lingcod	2	\N	26.0	\N	\N	April 16	October 15	\N	Check marine area regulations	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:04:40.339726+00
108	Washington	WA	Dungeness Crab	5	\N	\N	\N	\N	Varies	\N	Males only	Must be 6.25 inch minimum carapace width	saltwater	Puget Sound	f	f	f	2026-03-07 19:04:40.339726+00
109	Wisconsin	WI	Walleye	5	\N	15.0	\N	\N	First Saturday in May	March 1	\N	Varies by lake; some have slot limits	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
110	Wisconsin	WI	Largemouth Bass	5	\N	14.0	\N	\N	First Saturday in May	March 1	Catch-and-release in off-season	\N	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
111	Wisconsin	WI	Muskie	1	\N	40.0	\N	\N	First Saturday in May	December 31	\N	Minimum 40 inches; catch-and-release encouraged	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
112	Wisconsin	WI	Northern Pike	5	\N	24.0	\N	\N	First Saturday in May	March 1	\N	Only 1 over 36 inches	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
113	Wisconsin	WI	Yellow Perch	25	\N	\N	\N	\N	Year-round	\N	\N	Popular ice fishing species	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
114	Wisconsin	WI	Lake Sturgeon	1	\N	\N	\N	\N	February	\N	Spearing season only	Lottery tag required; very limited season	freshwater	Lake Winnebago	f	f	f	2026-03-07 19:04:40.339726+00
115	Wyoming	WY	Rainbow Trout	6	\N	\N	\N	\N	Year-round	\N	\N	Combined trout limit; varies by water	freshwater	\N	f	f	f	2026-03-07 19:04:40.339726+00
116	Wyoming	WY	Cutthroat Trout	3	\N	\N	\N	\N	Year-round	\N	\N	Lower limit on native cutthroat waters	freshwater	Rivers	f	f	f	2026-03-07 19:04:40.339726+00
117	Wyoming	WY	Walleye	6	\N	\N	\N	\N	Year-round	\N	\N	No minimum size on most waters	freshwater	Reservoirs	f	f	f	2026-03-07 19:04:40.339726+00
118	Wyoming	WY	Lake Trout	6	\N	\N	\N	\N	Year-round	\N	\N	No limit on some waters	freshwater	Lakes	f	f	f	2026-03-07 19:04:40.339726+00
119	Connecticut	CT	Largemouth Bass	6	\N	12.0	\N	\N	Third Saturday in April	November 30	Catch-and-release Dec-April	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
120	Connecticut	CT	Rainbow Trout	5	\N	9.0	\N	\N	Second Saturday in April	February 28	Opening day is popular	Trout management areas have special rules	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
121	Connecticut	CT	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Slot limit 28-35 inches or over 40 inches	saltwater	Long Island Sound	f	f	f	2026-03-07 19:05:39.345467+00
122	Delaware	DE	Largemouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
123	Delaware	DE	Striped Bass	2	\N	28.0	\N	\N	Year-round	\N	Varies by season	Check current slot limits	saltwater	Delaware Bay	f	f	f	2026-03-07 19:05:39.345467+00
124	Delaware	DE	Flounder	4	\N	18.0	\N	\N	Year-round	\N	\N	Check current size limits	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
125	Hawaii	HI	Mahi-Mahi	\N	\N	\N	\N	\N	Year-round	\N	\N	No bag or size limits for most pelagic species	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:05:39.345467+00
126	Hawaii	HI	Yellowfin Tuna	\N	\N	\N	\N	\N	Year-round	\N	\N	No bag or size limits	saltwater	Pacific Ocean	f	f	f	2026-03-07 19:05:39.345467+00
127	Hawaii	HI	Peacock Bass	\N	\N	\N	\N	\N	Year-round	\N	\N	No limits; introduced species	freshwater	Reservoirs	f	f	f	2026-03-07 19:05:39.345467+00
128	Hawaii	HI	Largemouth Bass	5	\N	\N	\N	\N	Year-round	\N	\N	Limited freshwater fishing	freshwater	Reservoirs	f	f	f	2026-03-07 19:05:39.345467+00
129	Indiana	IN	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
130	Indiana	IN	Walleye	6	\N	14.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
131	Indiana	IN	Channel Catfish	10	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
132	Indiana	IN	Bluegill	25	\N	\N	\N	\N	Year-round	\N	\N	Aggregate with other sunfish	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
133	Iowa	IA	Walleye	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake; some have slot limits	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
134	Iowa	IA	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
135	Iowa	IA	Channel Catfish	8	\N	15.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
136	Iowa	IA	Crappie	25	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
137	Iowa	IA	Northern Pike	5	\N	24.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
138	Kansas	KS	Largemouth Bass	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake type	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
139	Kansas	KS	Walleye	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
140	Kansas	KS	Channel Catfish	10	\N	15.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
141	Kansas	KS	Crappie	50	\N	\N	\N	\N	Year-round	\N	\N	Aggregate of black and white crappie	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
142	Kansas	KS	Flathead Catfish	5	\N	18.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
143	Kentucky	KY	Largemouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
144	Kentucky	KY	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
145	Kentucky	KY	Channel Catfish	15	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
146	Kentucky	KY	Walleye	6	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
147	Kentucky	KY	Muskie	1	\N	30.0	\N	\N	Year-round	\N	\N	Minimum 30 inches	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
148	Maine	ME	Landlocked Salmon	2	\N	14.0	\N	\N	April 1	September 30	Ice fishing season separate	Varies by water	freshwater	Lakes	f	f	f	2026-03-07 19:05:39.345467+00
149	Maine	ME	Brook Trout	5	\N	6.0	\N	\N	April 1	September 30	\N	Varies by water; some catch-and-release	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
150	Maine	ME	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
151	Maine	ME	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Check current slot limits	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
152	Maryland	MD	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	Catch-and-release encouraged	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
153	Maryland	MD	Striped Bass	2	\N	19.0	\N	\N	Year-round	\N	Varies by season	Check Chesapeake Bay specific regulations	saltwater	Chesapeake Bay	f	f	f	2026-03-07 19:05:39.345467+00
154	Maryland	MD	Blue Crab	1	\N	\N	\N	\N	April 1	December 15	\N	Males 5 inches minimum; 1 bushel per person	saltwater	Chesapeake Bay	f	f	f	2026-03-07 19:05:39.345467+00
155	Maryland	MD	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	Stocked waters	Trout stamp required	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
156	Massachusetts	MA	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
157	Massachusetts	MA	Rainbow Trout	3	\N	12.0	\N	\N	Year-round	\N	Stocked waters	Aggregate trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
158	Massachusetts	MA	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Check current slot limits	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
159	Massachusetts	MA	Cod	10	\N	19.0	\N	\N	Year-round	\N	\N	Check federal waters regulations	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
160	Mississippi	MS	Largemouth Bass	10	\N	14.0	\N	\N	Year-round	\N	\N	No more than 5 over 14 inches	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
161	Mississippi	MS	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
162	Mississippi	MS	Red Drum	3	\N	18.0	\N	30.0	Year-round	\N	\N	Slot limit 18-30 inches	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:05:39.345467+00
163	Mississippi	MS	Spotted Seatrout	15	\N	13.0	\N	\N	Year-round	\N	\N	Only 1 over 20 inches	saltwater	Gulf of Mexico	f	f	f	2026-03-07 19:05:39.345467+00
164	Missouri	MO	Largemouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
165	Missouri	MO	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
166	Missouri	MO	Channel Catfish	10	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
167	Missouri	MO	Rainbow Trout	4	\N	12.0	\N	\N	Year-round	\N	Stocked in winter	Trout parks have special regulations	freshwater	Trout Parks	f	f	f	2026-03-07 19:05:39.345467+00
168	Missouri	MO	Walleye	4	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
169	Nebraska	NE	Walleye	4	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
170	Nebraska	NE	Largemouth Bass	5	\N	15.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
171	Nebraska	NE	Channel Catfish	5	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
172	Nebraska	NE	Northern Pike	3	\N	24.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
173	Nevada	NV	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	\N	Combined trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
174	Nevada	NV	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	Varies by water	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
175	Nevada	NV	Striped Bass	20	\N	\N	\N	\N	Year-round	\N	\N	No limit at Lake Mead	freshwater	Lake Mead	f	f	f	2026-03-07 19:05:39.345467+00
176	Nevada	NV	Walleye	5	\N	16.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
177	New Hampshire	NH	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
178	New Hampshire	NH	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	\N	Combined trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
179	New Hampshire	NH	Landlocked Salmon	2	\N	15.0	\N	\N	Year-round	\N	\N	Varies by water	freshwater	Lakes	f	f	f	2026-03-07 19:05:39.345467+00
180	New Hampshire	NH	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Check current regulations	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
181	New Jersey	NJ	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
182	New Jersey	NJ	Rainbow Trout	6	\N	9.0	\N	\N	April 1	March 31	Opening day is very popular	Trout stamp required	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
183	New Jersey	NJ	Striped Bass	2	\N	28.0	\N	\N	Year-round	\N	\N	Check current slot limits	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
184	New Jersey	NJ	Fluke	3	\N	18.0	\N	\N	May 1	September 30	\N	Check current year size limit	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
185	New Jersey	NJ	Blue Crab	1	\N	\N	\N	\N	Year-round	\N	\N	Males 4.5 inches minimum; 1 bushel per person	saltwater	Delaware Bay	f	f	f	2026-03-07 19:05:39.345467+00
186	New Mexico	NM	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	\N	Combined trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
187	New Mexico	NM	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
188	New Mexico	NM	Walleye	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	Lakes	f	f	f	2026-03-07 19:05:39.345467+00
189	New Mexico	NM	Channel Catfish	15	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
190	North Dakota	ND	Walleye	5	\N	14.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
191	North Dakota	ND	Northern Pike	5	\N	24.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
192	North Dakota	ND	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
193	North Dakota	ND	Yellow Perch	20	\N	\N	\N	\N	Year-round	\N	\N	Popular ice fishing species	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
194	Ohio	OH	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
195	Ohio	OH	Walleye	6	\N	15.0	\N	\N	Year-round	\N	\N	Lake Erie has special regulations	freshwater	Lake Erie	f	f	f	2026-03-07 19:05:39.345467+00
196	Ohio	OH	Saugeye	6	\N	15.0	\N	\N	Year-round	\N	\N	Combined with walleye limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
197	Ohio	OH	Channel Catfish	10	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
198	Ohio	OH	Yellow Perch	30	\N	\N	\N	\N	Year-round	\N	\N	Lake Erie regulations may differ	freshwater	Lake Erie	f	f	f	2026-03-07 19:05:39.345467+00
199	Oklahoma	OK	Largemouth Bass	6	\N	14.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
200	Oklahoma	OK	Crappie	25	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
201	Oklahoma	OK	Channel Catfish	8	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
202	Oklahoma	OK	Walleye	5	\N	16.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
203	Oklahoma	OK	Striped Bass	2	\N	20.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	Lakes	f	f	f	2026-03-07 19:05:39.345467+00
204	Rhode Island	RI	Largemouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
205	Rhode Island	RI	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	Stocked waters	Combined trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
206	Rhode Island	RI	Striped Bass	1	\N	28.0	\N	\N	Year-round	\N	\N	Check current slot limits	saltwater	Atlantic Ocean	f	f	f	2026-03-07 19:05:39.345467+00
207	South Carolina	SC	Largemouth Bass	5	\N	14.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
208	South Carolina	SC	Crappie	20	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
209	South Carolina	SC	Red Drum	3	\N	15.0	\N	23.0	Year-round	\N	\N	Slot limit 15-23 inches; 1 fish may be over 23	saltwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
210	South Carolina	SC	Flounder	5	\N	15.0	\N	\N	Year-round	\N	\N	Check current regulations	saltwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
211	South Dakota	SD	Walleye	4	\N	15.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
212	South Dakota	SD	Northern Pike	3	\N	24.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
213	South Dakota	SD	Largemouth Bass	5	\N	15.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
214	South Dakota	SD	Yellow Perch	15	\N	\N	\N	\N	Year-round	\N	\N	Popular ice fishing species	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
215	Tennessee	TN	Largemouth Bass	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by reservoir	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
216	Tennessee	TN	Crappie	30	\N	10.0	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
217	Tennessee	TN	Walleye	5	\N	15.0	\N	\N	Year-round	\N	\N	Varies by reservoir	freshwater	Reservoirs	f	f	f	2026-03-07 19:05:39.345467+00
218	Tennessee	TN	Smallmouth Bass	5	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	Rivers	f	f	f	2026-03-07 19:05:39.345467+00
219	Tennessee	TN	Striped Bass	2	\N	15.0	\N	\N	Year-round	\N	\N	Varies by reservoir	freshwater	Reservoirs	f	f	f	2026-03-07 19:05:39.345467+00
220	Utah	UT	Rainbow Trout	4	\N	\N	\N	\N	Year-round	\N	\N	Combined trout limit; varies by water	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
221	Utah	UT	Largemouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
222	Utah	UT	Walleye	6	\N	15.0	\N	\N	Year-round	\N	\N	Varies by water	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
223	Utah	UT	Northern Pike	12	\N	\N	\N	\N	Year-round	\N	\N	No limit on some waters to control population	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
224	Utah	UT	Cutthroat Trout	2	\N	\N	\N	\N	Year-round	\N	\N	Bonneville cutthroat: catch-and-release on some waters	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
225	Vermont	VT	Largemouth Bass	5	\N	12.0	\N	\N	Second Saturday in June	November 30	Catch-and-release in off-season	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
226	Vermont	VT	Rainbow Trout	6	\N	12.0	\N	\N	Second Saturday in April	October 31	\N	Combined trout limit	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
227	Vermont	VT	Landlocked Salmon	2	\N	15.0	\N	\N	Second Saturday in April	October 31	\N	Varies by water	freshwater	Lakes	f	f	f	2026-03-07 19:05:39.345467+00
228	Vermont	VT	Northern Pike	5	\N	20.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
229	West Virginia	WV	Largemouth Bass	6	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
230	West Virginia	WV	Rainbow Trout	6	\N	\N	\N	\N	Year-round	\N	Stocked waters	Trout stamp required for stocked waters	freshwater	Streams	f	f	f	2026-03-07 19:05:39.345467+00
231	West Virginia	WV	Channel Catfish	10	\N	\N	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:39.345467+00
232	West Virginia	WV	Walleye	4	\N	15.0	\N	\N	Year-round	\N	\N	Varies by river	freshwater	Rivers	f	f	f	2026-03-07 19:05:39.345467+00
233	West Virginia	WV	Muskie	2	\N	36.0	\N	\N	Year-round	\N	\N	Minimum 36 inches	freshwater	Rivers	f	f	f	2026-03-07 19:05:39.345467+00
234	Arkansas	AR	Largemouth Bass	6	\N	14.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	\N	f	f	f	2026-03-07 19:05:57.492847+00
235	Arkansas	AR	Crappie	30	\N	\N	\N	\N	Year-round	\N	\N	Aggregate limit	freshwater	\N	f	f	f	2026-03-07 19:05:57.492847+00
236	Arkansas	AR	Channel Catfish	10	\N	12.0	\N	\N	Year-round	\N	\N	\N	freshwater	\N	f	f	f	2026-03-07 19:05:57.492847+00
237	Arkansas	AR	Rainbow Trout	5	\N	\N	\N	\N	Year-round	\N	Stocked in tailwaters	White River system has special regulations	freshwater	White River	f	f	f	2026-03-07 19:05:57.492847+00
238	Arkansas	AR	Striped Bass	3	\N	20.0	\N	\N	Year-round	\N	\N	Varies by lake	freshwater	Lakes	f	f	f	2026-03-07 19:05:57.492847+00
\.


--
-- Data for Name: fishing_species; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".fishing_species (id, name, scientific_name, category, subcategory, description, image_url, habitat, average_size, record_size, best_seasons, peak_season, recommended_bait, recommended_lures, techniques, difficulty, fun_fact, conservation, is_active, created_at, updated_at) FROM stdin;
aa12d78f-5acc-4815-9923-5608bc6722d1	Largemouth Bass	Micropterus salmoides	freshwater	Bass	The largemouth bass is the most popular freshwater game fish in North America. Known for explosive strikes and acrobatic fights, they are the cornerstone of competitive bass fishing tournaments.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192375917_e31b6d53.jpg	Found in warm, shallow lakes, ponds, rivers, and reservoirs. They prefer areas with abundant cover such as submerged vegetation, fallen trees, docks, and rocky structures. They thrive in water temperatures between 65-85°F.	2-5 lbs, 12-20 inches	22 lbs 4 oz (George Perry, 1932)	{Spring,Summer,Fall}	Spring (pre-spawn and spawn)	{"Live shiners",Nightcrawlers,Crawfish,Minnows}	{"Plastic worms",Crankbaits,Spinnerbaits,Jigs,"Topwater frogs",Swimbaits}	{"Flipping & pitching","Texas rig","Carolina rig","Drop shot","Topwater fishing"}	Beginner	Largemouth bass can eat prey up to 50% of their own body length. Their mouth can open wide enough to swallow large bluegill and even small ducks!	Widely managed through catch-and-release practices and slot limits. Populations are generally healthy across the US.	t	2026-09-23 06:22:29.887779+00	2026-09-23 06:25:04.354598+00
a014f52d-8a29-45ee-b856-9efd24e8068f	Striped Bass	Morone saxatilis	anadromous	Bass	Striped bass, also known as 'stripers' or 'rockfish,' are powerful fighters prized by both freshwater and saltwater anglers. They migrate between salt and freshwater to spawn.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192380470_adb172d5.png	Found along the Atlantic coast from Canada to Florida, and in large inland reservoirs. They prefer cool, well-oxygenated water and are often found near structure, current breaks, and baitfish schools.	5-20 lbs, 18-36 inches	81 lbs 14 oz (Greg Myerson, 2011)	{Spring,Fall}	Fall (migration feeding frenzy)	{"Live eels",Bunker/menhaden,Clams,Bloodworms,Herring}	{"Bucktail jigs",Swimbaits,"Topwater plugs","Soft plastics","Metal lip swimmers"}	{Trolling,"Surf casting","Live lining",Jigging,"Fly fishing"}	Intermediate	Striped bass can live up to 30 years and travel thousands of miles during their annual migration along the Atlantic coast.	Subject to strict regulations due to historical overfishing. Populations have recovered significantly since the 1990s moratorium.	t	2026-09-23 06:22:31.337534+00	2026-09-23 06:25:05.877755+00
0ebf100b-47b6-418e-9fd7-ff0592746215	Smallmouth Bass	Micropterus dolomieu	freshwater	Bass	Often called 'bronzebacks' for their distinctive coloring, smallmouth bass are considered pound-for-pound the hardest fighting freshwater fish. They are prized for their aerial acrobatics.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192384483_78996ecd.png	Prefer clear, cool rivers and rocky lakes with gravel or boulder bottoms. Found throughout the northern US and southern Canada in streams, rivers, and deep clear lakes.	1-3 lbs, 10-16 inches	11 lbs 15 oz (David Hayes, 1955)	{Spring,Summer,Fall}	Summer (active feeding)	{Crawfish,Hellgrammites,Minnows,Leeches}	{"Tube jigs","Ned rigs",Crankbaits,"Topwater poppers",Spinnerbaits}	{"Drop shot","Ned rig","Fly fishing",Jigging,"Drift fishing"}	Intermediate	Smallmouth bass males guard the nest for up to a month after spawning, fiercely protecting the eggs and fry from predators.	Generally healthy populations. Sensitive to water quality changes and serve as indicators of stream health.	t	2026-09-23 06:22:31.655442+00	2026-09-23 06:25:06.252002+00
7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	Brown Trout	Salmo trutta	freshwater	Trout	Originally from Europe, brown trout are known for their wariness and difficulty to catch, making them a prized target for experienced anglers. They are the most challenging trout species to fool.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192399932_a19194c3.jpg	Cool streams and rivers with undercut banks, deep pools, and overhanging vegetation. More tolerant of warmer water than other trout species, surviving in temperatures up to 75°F.	1-5 lbs, 14-22 inches	44 lbs 11 oz (Tom Healy, 2009)	{Fall,Spring}	Fall (spawning run, aggressive feeding)	{Nightcrawlers,Minnows,Crawfish,Grasshoppers}	{"Rapala minnows","Woolly buggers",Streamers,Nymphs,Spoons}	{"Fly fishing",Nymphing,"Streamer fishing","Night fishing","Drift fishing"}	Advanced	Brown trout become increasingly nocturnal as they grow larger. Trophy browns are often caught at night or during low-light conditions.	Non-native to North America but well-established. Can outcompete native trout species in some waters.	t	2026-09-23 06:22:32.317138+00	2026-09-23 06:25:06.894262+00
701be5f7-eb3d-4da3-8090-a0ce99374b8d	Cutthroat Trout	Oncorhynchus clarkii	freshwater	Trout	Named for the distinctive red-orange slash marks under their jaw, cutthroat trout are native to western North America. They are a symbol of pristine mountain wilderness.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192406269_fb901d58.png	Cold mountain streams, alpine lakes, and rivers throughout the western US. Prefer clear, cold water with rocky bottoms and abundant insect life.	1-3 lbs, 10-18 inches	41 lbs (John Skimmerhorn, 1925)	{Summer,Fall}	Summer (high-country fishing)	{Worms,Grasshoppers,"Salmon eggs"}	{"Dry flies",Nymphs,"Small spinners","Elk hair caddis"}	{"Fly fishing","Backcountry fishing","Sight fishing","Dry fly fishing"}	Intermediate	There are 14 recognized subspecies of cutthroat trout, each adapted to specific river drainages in the western US.	Many subspecies are threatened or endangered. Hybridization with rainbow trout is a major conservation concern.	t	2026-09-23 06:22:32.964535+00	2026-09-23 06:25:07.587989+00
56c9e4d0-9670-4300-9ee6-1ca88f629dc4	Lake Trout	Salvelinus namaycush	freshwater	Trout	Lake trout, also known as 'mackinaw' or 'lakers,' are the largest of the char family. They inhabit deep, cold lakes and can grow to enormous sizes in the Great Lakes region.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192404783_101a01dc.jpg	Deep, cold oligotrophic lakes with water temperatures between 40-55°F. Found in the Great Lakes, northern US, and Canadian shield lakes.	5-15 lbs, 20-30 inches	72 lbs (Lloyd Bull, 1995)	{Spring,Fall,Winter}	Spring (shallow water feeding after ice-out)	{Smelt,Cisco,Minnows,"Cut bait"}	{"Large spoons","Tube jigs",Swimbaits,"Flutter spoons"}	{Trolling,Jigging,"Ice fishing",Downrigging,"Flatline trolling"}	Intermediate	Lake trout can live over 60 years, making them one of the longest-lived freshwater fish in North America.	Populations decimated by sea lamprey in the Great Lakes. Restoration efforts have been ongoing since the 1960s.	t	2026-09-23 06:22:33.301495+00	2026-09-23 06:25:07.93415+00
4ddb8d28-7b6e-44ab-90e6-a871f6ccdddc	Blue Catfish	Ictalurus furcatus	freshwater	Catfish	Blue catfish are the largest catfish species in North America. These powerful fish can grow to over 100 pounds and provide an incredible fight on rod and reel.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192464965_4002048c.png	Large rivers, reservoirs, and tidal waters. They prefer deep channels with strong current and hard bottoms. Most abundant in the Mississippi, Missouri, and Ohio river systems.	5-20 lbs, 20-35 inches	143 lbs (Richard Anderson, 2011)	{Spring,Summer,Fall}	Summer (peak feeding in warm water)	{"Fresh cut shad","Live skipjack herring","Blue gill","Chicken breast"}	{"Large jigs with cut bait","Rattling lures"}	{"Anchored fishing","Drift fishing",Trolling,"Santee rig"}	Intermediate	Blue catfish are considered an invasive species in the Chesapeake Bay, where they have grown to massive sizes and threaten native species.	Native populations healthy. Invasive in some eastern waterways where they outcompete native species.	t	2026-09-23 06:22:34.669355+00	2026-09-23 06:25:09.279267+00
24fbaae8-d9f1-4a2a-9b95-72e475fd99fe	Flathead Catfish	Pylodictis olivaris	freshwater	Catfish	Flathead catfish are solitary predators that prefer live prey. Known for their distinctive flat head and mottled coloring, they are the second largest catfish species in North America.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192463034_95364948.jpg	Large rivers and reservoirs with deep pools, log jams, and undercut banks. They are ambush predators that hide in cover and wait for prey to come to them.	5-20 lbs, 20-35 inches	123 lbs (Ken Paulie, 1998)	{Summer,Fall}	Summer (nighttime feeding)	{"Live bluegill","Live shad","Live perch","Large minnows"}	{"Large jigs","Swimbaits (rarely effective)"}	{"Live bait fishing","Noodling/hand fishing","Jug fishing","Limb lining","Night fishing"}	Advanced	Flathead catfish are one of the few catfish species that strongly prefer live bait over dead or prepared baits. They are also caught by 'noodling' - reaching into underwater holes to grab them by hand!	Invasive outside their native range. Can devastate native fish populations in new waters.	t	2026-09-23 06:22:34.999709+00	2026-09-23 06:25:09.603431+00
71def261-17c0-4add-b88c-4c857a79fadf	Walleye	Sander vitreus	freshwater	Perch	Walleye are the most sought-after freshwater fish in the northern US and Canada. Named for their large, glassy eyes that reflect light, they are prized for their excellent table fare.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192423980_5749157a.jpg	Large lakes, reservoirs, and rivers with moderate to low clarity. They prefer rocky or gravel bottoms and are most active during low-light conditions (dawn, dusk, night).	2-5 lbs, 15-22 inches	25 lbs (Mabry Harper, 1960)	{Spring,Fall}	Spring (post-spawn feeding)	{Leeches,Nightcrawlers,Minnows}	{"Jig and minnow",Crankbaits,"Spinner rigs","Blade baits","Jigging Raps"}	{Jigging,Trolling,"Live bait rigging","Slip bobber fishing","Casting crankbaits"}	Intermediate	Walleye have a special reflective layer in their eyes called the tapetum lucidum, which gives them exceptional night vision and their characteristic glowing eyes.	Well-managed across most of their range. Stocking programs maintain populations in many lakes and reservoirs.	t	2026-09-23 06:22:33.674904+00	2026-09-23 06:25:08.264014+00
d598219e-93bb-44a9-87df-757f180c6a2f	Yellow Perch	Perca flavescens	freshwater	Perch	Yellow perch are one of the most popular panfish in North America, known for their delicious, flaky white meat. They are a staple of ice fishing and Great Lakes fishing.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192425549_c87503df.jpg	Lakes, ponds, and slow-moving rivers with moderate vegetation. Found throughout the northern US and Great Lakes region. Prefer water temperatures between 63-77°F.	0.5-1 lb, 7-10 inches	4 lbs 3 oz (Dr. C.C. Abbott, 1865)	{Spring,Winter}	Winter (ice fishing)	{Minnows,"Wax worms",Maggots,"Small leeches"}	{"Small jigs","Ice flies","Jigging spoons","Beetle spins"}	{"Ice fishing","Bobber fishing",Jigging,"Bottom bouncing"}	Beginner	A single female yellow perch can produce up to 40,000 eggs in a single gelatinous strand that can be over 7 feet long!	Populations fluctuate naturally. Lake Erie perch fishery is one of the most valuable freshwater fisheries in the world.	t	2026-09-23 06:22:34.015454+00	2026-09-23 06:25:08.608127+00
92dacbdc-9db8-40c7-b108-10b669dcd29b	Channel Catfish	Ictalurus punctatus	freshwater	Catfish	Channel catfish are the most popular catfish species in North America. They are excellent fighters and provide outstanding table fare, making them a favorite of anglers of all skill levels.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192458033_43ceb8e3.jpg	Rivers, lakes, reservoirs, and ponds across the US. They prefer clean, warm water with sand or gravel bottoms and moderate current. Found in virtually every state.	2-5 lbs, 15-24 inches	58 lbs (W.B. Whaley, 1964)	{Spring,Summer}	Summer (warm water feeding)	{"Cut bait","Chicken liver","Stink bait",Nightcrawlers,Shrimp,"Hot dogs"}	{"Punch bait","Dip bait rigs","Jig and cut bait"}	{"Bottom fishing","Drift fishing","Jug fishing",Trotlining,"Bank fishing"}	Beginner	Channel catfish have over 100,000 taste buds covering their entire body, allowing them to taste and smell food from great distances in murky water.	Abundant and widely stocked. One of the most commercially farmed fish in the US.	t	2026-09-23 06:22:34.340279+00	2026-09-23 06:25:08.932695+00
df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	Chinook Salmon	Oncorhynchus tshawytscha	anadromous	Salmon	Also known as King Salmon, Chinook are the largest Pacific salmon species and one of the most prized game fish in the world. Their powerful runs and incredible size make them legendary.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192515880_3547b056.jpg	Pacific Ocean and coastal rivers from California to Alaska. They spawn in large, cold rivers with gravel beds. Also stocked in the Great Lakes where they have established reproducing populations.	15-30 lbs, 30-40 inches	97 lbs 4 oz (Les Anderson, 1985)	{Summer,Fall}	Summer (river runs)	{"Salmon eggs/roe",Herring,Anchovies,"Sand shrimp"}	{Spinners,Spoons,"Plugs (Kwikfish)","Fly patterns","Cut plug herring"}	{Trolling,Back-bouncing,"Fly fishing",Plunking,Mooching}	Advanced	Chinook salmon can travel over 2,000 miles upstream to reach their spawning grounds, navigating rapids and waterfalls along the way.	Many runs are threatened or endangered. Extensive hatchery programs and habitat restoration efforts are ongoing.	t	2026-09-23 06:22:35.340822+00	2026-09-23 06:25:09.943153+00
a04b3406-7811-46e6-9291-1f1bb675eb0c	Coho Salmon	Oncorhynchus kisutch	anadromous	Salmon	Coho salmon, also called Silver Salmon, are known for their acrobatic fights and spectacular leaping ability. They are a favorite target for both ocean and river anglers.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192525284_79e0ca76.png	Pacific Ocean and coastal streams from California to Alaska. Also stocked in the Great Lakes. They prefer smaller streams than Chinook for spawning.	8-12 lbs, 24-30 inches	33 lbs 4 oz (Jerry Lifton, 1989)	{Fall,Winter}	Fall (river runs)	{"Salmon eggs","Sand shrimp",Herring}	{Spinners,Spoons,Jigs,"Flies (egg patterns, streamers)"}	{"Fly fishing","Float fishing",Trolling,"Casting spoons","Drift fishing"}	Intermediate	Coho salmon are the most acrobatic of all Pacific salmon species, often making spectacular leaps completely out of the water when hooked.	Several populations listed as threatened. Habitat restoration and hatchery programs support wild populations.	t	2026-09-23 06:22:35.665262+00	2026-09-23 06:25:10.271006+00
052220aa-f8a7-4f8a-bff8-66d4dde06709	Steelhead	Oncorhynchus mykiss	anadromous	Trout	Steelhead are the ocean-going form of rainbow trout. They are considered by many to be the ultimate freshwater game fish, combining the power of a salmon with the acrobatics of a trout.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192407532_ffa32728.png	Pacific Ocean and Great Lakes tributaries. They run into rivers to spawn but unlike Pacific salmon, they can survive spawning and return to the ocean or lake multiple times.	6-12 lbs, 24-32 inches	42 lbs 3 oz (David White, 2014)	{Fall,Winter,Spring}	Winter (winter-run steelhead)	{"Salmon eggs","Sand shrimp",Nightcrawlers}	{Spinners,Spoons,Jigs,Beads,"Fly patterns (intruders, egg patterns)"}	{"Fly fishing (spey casting)","Float fishing","Drift fishing","Side drifting",Plunking}	Expert	Steelhead are the same species as rainbow trout (Oncorhynchus mykiss). The only difference is that steelhead migrate to the ocean or Great Lakes, while rainbow trout stay in freshwater.	Many wild runs are threatened. Extensive hatchery programs exist but wild steelhead conservation is a priority.	t	2026-09-23 06:22:36.321462+00	2026-09-23 06:25:10.942112+00
7d59faaa-c410-46db-a020-26a60717cf11	Bluegill	Lepomis macrochirus	freshwater	Panfish	Bluegill are the most popular panfish in America and often the first fish caught by young anglers. Despite their small size, they are scrappy fighters and excellent eating.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192547408_27b9d08f.png	Ponds, lakes, rivers, and streams across the entire US. They prefer warm, shallow water with vegetation and are found in virtually every body of freshwater in the country.	0.25-0.75 lbs, 6-9 inches	4 lbs 12 oz (T.S. Hudson, 1950)	{Spring,Summer}	Spring/Summer (bedding season)	{Worms,Crickets,"Wax worms","Bread balls",Corn}	{"Small jigs","Tiny spinners",Poppers,Flies,"Beetle spins"}	{"Bobber fishing","Fly fishing","Ultralight spinning","Sight fishing beds"}	Beginner	Male bluegill build and guard circular nests called 'beds' in shallow water. During spawning season, you can see dozens of these beds clustered together in colonies.	Extremely abundant. One of the most resilient and adaptable freshwater fish species.	t	2026-09-23 06:22:36.655569+00	2026-09-23 06:25:11.248292+00
60906d64-65dc-4e98-a18d-33438a97de0a	Blue Marlin	Makaira nigricans	saltwater	Billfish	Blue marlin are the ultimate big game fish and the pinnacle of offshore sport fishing. These magnificent creatures can exceed 1,000 pounds and put on spectacular aerial displays.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192468387_9210ce63.png	Deep tropical and subtropical waters of the Atlantic and Pacific oceans. Found near current edges, temperature breaks, and underwater structure. Highly migratory.	200-400 lbs, 8-11 feet	1,376 lbs (Paulo Amorim, 1992)	{Summer,Fall}	Summer (peak migration)	{"Live tuna","Live bonito",Mackerel,Ballyhoo}	{"Large skirted lures","Trolling spreader bars","Daisy chains"}	{Trolling,"Live bait fishing","Kite fishing","Dredge fishing"}	Expert	Blue marlin can swim at speeds up to 68 mph, making them one of the fastest fish in the ocean. A fight with a large blue marlin can last several hours.	Overfished in many areas. Catch-and-release is strongly encouraged. International management through ICCAT.	t	2026-09-23 06:22:38.667663+00	2026-09-23 06:25:13.25563+00
a9bb507d-ae6e-45fb-9a9a-b5d85cebc57c	Wahoo	Acanthocybium solandri	saltwater	Pelagic	Wahoo are one of the fastest fish in the ocean, capable of speeds over 60 mph. Their incredible speed, razor-sharp teeth, and excellent flavor make them a prized offshore catch.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192493155_1fd02005.jpg	Tropical and subtropical waters worldwide. Found near current edges, drop-offs, and floating debris. They are solitary or travel in small groups.	20-50 lbs, 40-60 inches	184 lbs (Sara Hayward, 1993)	{Fall,Winter}	Fall (peak migration)	{Ballyhoo,"Bonito strips","Live bait"}	{"High-speed trolling lures","Wahoo bombs","Skirted ballyhoo","Rapala magnums"}	{"High-speed trolling","Live bait fishing","Slow trolling","Deep dropping"}	Advanced	Wahoo can accelerate from a standstill to 60 mph in seconds. Their initial run when hooked is one of the most explosive in all of fishing.	Not overfished. Relatively low commercial value helps protect populations.	t	2026-09-23 06:22:39.967479+00	2026-09-23 06:25:14.611114+00
7d9d62f2-240f-48e6-afa4-c86d807331b9	Spotted Bass	Micropterus punctulatus	freshwater	Bass	Spotted bass are often confused with largemouth bass but are a distinct species. They are aggressive fighters that prefer deeper, rocky habitat.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192380385_9138fee2.png	Clear reservoirs, rivers, and streams in the southeastern and central US. They prefer rocky bluffs, points, and deeper water than largemouth bass.	1-3 lbs, 10-16 inches	11 lbs 4 oz (Nick Dulleck, 2017)	{Spring,Summer,Fall}	Spring (pre-spawn)	{Crawfish,Minnows,Nightcrawlers}	{Jerkbaits,"Drop shot rigs",Crankbaits,Jigs,Spoons}	{"Drop shot","Jigging bluffs","Crankbait fishing","Finesse fishing"}	Intermediate	Spotted bass are more closely related to smallmouth bass than largemouth bass, despite looking more similar to largemouths.	Healthy populations. Can be invasive in some western waters where they compete with native species.	t	2026-09-23 06:22:42.603985+00	2026-09-23 06:25:17.321212+00
3138d303-9b9b-48af-bd08-b4fbae411d2d	Northern Pike	Esox lucius	freshwater	Pike	Northern pike are aggressive predators known as 'water wolves.' With their torpedo-shaped bodies and razor-sharp teeth, they are explosive strikers and powerful fighters.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192380731_c9ce93b6.jpg	Weedy lakes, rivers, and reservoirs throughout the northern US and Canada. They prefer shallow, vegetated bays and are ambush predators that lurk in weed edges.	3-10 lbs, 24-36 inches	46 lbs 2 oz (Peter Dubuc, 1940)	{Spring,Fall}	Fall (aggressive pre-winter feeding)	{"Large minnows",Suckers,Smelt}	{Spinnerbaits,Spoons,Jerkbaits,"Large swimbaits","Topwater buzzbaits"}	{Casting,Trolling,"Tip-up fishing (ice)","Dead bait fishing","Fly fishing"}	Intermediate	Northern pike have been known to attack ducklings, muskrats, and even small dogs! They are one of the most aggressive freshwater predators.	Generally abundant. Can become invasive in waters where they are not native.	t	2026-09-23 06:22:37.300573+00	2026-09-23 06:25:11.932654+00
d09951e3-25b2-49c7-b311-c2c7af1572e4	Red Snapper	Lutjanus campechanus	saltwater	Snapper	Red snapper are one of the most prized saltwater fish in the Gulf of Mexico. Their vibrant red color, excellent fighting ability, and outstanding flavor make them a top target.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192496516_a8de7c7b.jpg	Gulf of Mexico and southeastern Atlantic coast. Found near reefs, wrecks, oil platforms, and rocky bottom structure at depths of 30-300 feet.	5-15 lbs, 18-28 inches	50 lbs 4 oz (Doc Kennedy, 1996)	{Summer,Fall}	Summer (June-August, federal season)	{"Cut squid","Cigar minnows","Live pinfish",Shrimp}	{"Butterfly jigs","Vertical jigs","Bucktail jigs"}	{"Bottom fishing","Vertical jigging","Drift fishing","Anchored fishing"}	Intermediate	Red snapper can live over 50 years and don't reach sexual maturity until age 2-5. This slow reproduction makes them vulnerable to overfishing.	Heavily regulated with short federal seasons. Populations have been rebuilding since strict management measures were implemented.	t	2026-09-23 06:22:37.63346+00	2026-09-23 06:25:12.257567+00
203622e6-46ea-4e8d-a537-50a3c4a42c4a	Mahi-Mahi	Coryphaena hippurus	saltwater	Pelagic	Also known as dolphinfish or dorado, mahi-mahi are among the most colorful and acrobatic fish in the ocean. Their brilliant blue, green, and gold coloring is unmatched.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192427356_96b85548.jpg	Warm tropical and subtropical waters worldwide. Found in the Gulf of Mexico, Atlantic, and Pacific. They congregate around floating debris, weed lines, and current edges.	5-15 lbs, 20-35 inches	87 lbs (Manuel Salazar, 1976)	{Spring,Summer}	Summer (peak offshore season)	{Ballyhoo,Pilchards,"Flying fish",Squid}	{"Trolling lures",Feathers,"Cedar plugs","Bucktail jigs"}	{Trolling,"Sight casting","Live bait fishing","Fly fishing"}	Intermediate	Mahi-mahi are one of the fastest-growing fish in the ocean, reaching 4-5 feet in just one year. They rarely live longer than 5 years.	Not overfished. Their fast growth rate and high reproduction make them resilient to fishing pressure.	t	2026-09-23 06:22:37.976466+00	2026-09-23 06:25:12.590727+00
6ea5e4b9-28cf-47b7-8bd2-34e8f11f5172	Halibut	Hippoglossus stenolepis	saltwater	Flatfish	Pacific halibut are the largest flatfish in the world and a prized catch in Alaska and the Pacific Northwest. They provide outstanding table fare and an incredible fight from the deep.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192430067_e34f94eb.jpg	North Pacific Ocean from California to Alaska. Found on sandy or muddy bottoms at depths of 20-1,000 feet. They migrate between shallow summer feeding grounds and deep winter habitat.	20-50 lbs, 30-50 inches	459 lbs (Jack Tragis, 1996)	{Summer}	Summer (May-September)	{Herring,Octopus,"Salmon heads","Large jigs with bait"}	{"Large jigs",Swimbaits,"Halibut spreader bars"}	{"Bottom fishing","Drift fishing",Jigging,"Anchored fishing"}	Intermediate	Halibut are born with eyes on both sides of their head like normal fish. As they mature, one eye migrates to the other side, and they spend their lives lying flat on the ocean floor.	Well-managed through the International Pacific Halibut Commission. Strict quotas and seasons maintain healthy populations.	t	2026-09-23 06:22:38.987519+00	2026-09-23 06:25:13.594375+00
da5fb3b3-8190-45fd-8407-cb7d148b572c	Tarpon	Megalops atlanticus	saltwater	Gamefish	Tarpon are the 'Silver King' of sport fishing. These prehistoric fish can grow over 200 pounds and are famous for their spectacular aerial leaps when hooked. They are almost always released.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192429111_9cc7504b.jpg	Warm coastal waters, estuaries, mangrove channels, and passes in Florida, the Gulf of Mexico, and the Caribbean. They can tolerate both salt and fresh water.	40-80 lbs, 48-72 inches	286 lbs 9 oz (Max Domecq, 2003)	{Spring,Summer}	Spring (May-June migration)	{"Live crabs","Live mullet","Live pinfish",Shrimp}	{"Large streamers","DOA shrimp","Soft plastics","MirrOlure plugs"}	{"Sight fishing","Fly fishing","Live bait fishing","Bridge fishing","Pass fishing"}	Expert	Tarpon are a prehistoric species that have remained virtually unchanged for over 100 million years. They can gulp air at the surface, allowing them to survive in oxygen-poor water.	Catch-and-release only in Florida. Populations are generally healthy but habitat loss is a concern.	t	2026-09-23 06:22:39.316385+00	2026-09-23 06:25:13.935913+00
cdf792b7-7575-45b8-80ce-aa9c310644db	Yellowfin Tuna	Thunnus albacares	saltwater	Tuna	Yellowfin tuna are powerful, fast-swimming predators that can reach speeds of 50 mph. They are prized by offshore anglers for their incredible strength and excellent sashimi-grade meat.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192489988_33a25bf2.jpg	Warm tropical and subtropical oceans worldwide. Found in deep offshore waters near current edges, seamounts, and floating debris. Water temperatures of 72-82°F.	20-80 lbs, 30-60 inches	427 lbs (Guy Yocom, 2012)	{Summer,Fall}	Summer (warm water peak)	{"Live bait (sardines, mackerel)","Chunk bait",Squid}	{"Cedar plugs","Skirted trolling lures",Poppers,Stickbaits}	{Trolling,Chunking,Popping,Jigging,"Kite fishing"}	Advanced	Yellowfin tuna can maintain a body temperature up to 10°F warmer than the surrounding water, giving them a metabolic advantage for speed and power.	Some stocks are overfished. International management agreements regulate catch limits.	t	2026-09-23 06:22:38.323479+00	2026-09-23 06:25:12.936681+00
c5904e68-10a5-4205-ad87-8690b6e7fbbc	Golden Trout	Oncorhynchus aguabonita	freshwater	Trout	Golden trout are the most beautiful freshwater fish in North America. Native to high-altitude streams in the Sierra Nevada, they are a bucket-list species for many anglers.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192520514_7f3f4dca.jpg	High-altitude mountain streams and lakes above 8,000 feet in the Sierra Nevada and other western mountain ranges. They require extremely cold, clean water.	6-12 inches, 0.25-1 lb	11 lbs (Charles Reed, 1948)	{Summer}	Summer (July-August, when high country is accessible)	{"Small worms",Insects}	{"Tiny dry flies","Small nymphs","Ultralight spinners"}	{"Fly fishing","Ultralight spinning","Backcountry fishing"}	Advanced	Golden trout are the state freshwater fish of California. To catch one in their native habitat, you typically need to hike several miles into remote mountain wilderness.	Threatened by hybridization with rainbow trout and habitat changes. Conservation efforts focus on removing non-native trout from golden trout waters.	t	2026-09-23 06:22:41.266644+00	2026-09-23 06:25:16.005913+00
f9279e99-f956-4907-8b13-210d5de15680	Sturgeon	Acipenser spp.	freshwater	Primitive	Sturgeon are living dinosaurs that have existed for over 200 million years. These massive fish can grow to enormous sizes and provide an unforgettable fishing experience.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192444898_4e6aaedf.png	Large rivers, estuaries, and coastal waters. White sturgeon are found in Pacific coast rivers, while lake sturgeon inhabit the Great Lakes and Mississippi basin.	30-60 lbs, 40-60 inches	468 lbs (Joey Pallotta, 1983)	{Spring,Fall}	Spring (spawning migration)	{Nightcrawlers,"Sand shrimp",Smelt,"Salmon eggs"}	{"Rarely caught on lures - bait fishing is standard"}	{"Bottom fishing","Anchor fishing",Plunking,"Drift fishing"}	Intermediate	White sturgeon can live over 100 years and grow to over 1,500 pounds. They are the largest freshwater fish in North America.	Many species are endangered or threatened. Strict catch-and-release regulations protect most populations.	t	2026-09-23 06:22:39.6325+00	2026-09-23 06:25:14.280607+00
6b3f619c-a582-4691-b14e-098f879509ad	Lingcod	Ophiodon elongatus	saltwater	Bottomfish	Lingcod are aggressive predators of the Pacific coast with oversized mouths full of sharp teeth. Despite their fearsome appearance, they are one of the best-eating fish in the Pacific.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192502345_acaa2301.png	Rocky reefs, kelp forests, and rocky bottoms along the Pacific coast from Alaska to Baja California. Found at depths of 30-300 feet.	10-25 lbs, 24-40 inches	82 lbs (Robert Halal, 2014)	{Fall,Winter,Spring}	Fall (pre-spawn feeding)	{"Live bait (herring, greenling)",Squid,Octopus}	{"Large swimbaits",Jigs,"Metal jigs","Shrimp flies"}	{Jigging,"Drift fishing",Mooching,"Bottom bouncing"}	Intermediate	About 20% of lingcod have blue-green colored flesh due to a bile pigment called biliverdin. The color disappears when cooked and is perfectly safe to eat!	Well-managed along the Pacific coast. Populations have recovered from historical overfishing.	t	2026-09-23 06:22:40.282687+00	2026-09-23 06:25:14.939302+00
8fb47dda-b961-457f-9a66-448822fe0bbf	Dolly Varden	Salvelinus malma	freshwater	Char	Dolly Varden are a species of char found in cold waters of the Pacific Northwest and Alaska. They are beautiful fish with pink and red spots on a dark background.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192502010_60b1ad78.png	Cold streams, rivers, and lakes in Alaska, Washington, and the Pacific Northwest. Both anadromous and resident freshwater forms exist.	1-4 lbs, 12-20 inches	18 lbs 9 oz (Rick Grams, 2002)	{Summer,Fall}	Summer (feeding on salmon eggs)	{"Salmon eggs",Worms,"Small minnows"}	{"Egg patterns","Small spinners",Streamers,Beads}	{"Fly fishing","Drift fishing","Spin fishing","Egg fishing below spawning salmon"}	Intermediate	Dolly Varden were named after a character in Charles Dickens' novel 'Barnaby Rudge' who was known for wearing a colorful dress with pink spots.	Generally healthy populations in Alaska. Some southern populations are declining due to habitat loss.	t	2026-09-23 06:22:41.933001+00	2026-09-23 06:25:16.633261+00
b8cf8f59-fb53-4440-82f0-82817fa78a5f	Flounder	Paralichthys spp.	saltwater	Flatfish	Flounder are prized flatfish found along both coasts of the US. Summer flounder (fluke) and winter flounder are the most popular species, known for their delicate, mild flavor.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192462385_8c110e2f.jpg	Sandy and muddy bottoms in bays, estuaries, and nearshore ocean waters. They are masters of camouflage, lying flat on the bottom and ambushing prey.	2-5 lbs, 15-22 inches	22 lbs 7 oz (Charles Nappi, 1975)	{Spring,Summer,Fall}	Summer (inshore feeding)	{"Live minnows","Squid strips","Gulp swimming mullet",Shrimp}	{"Bucktail jigs","Gulp baits","Fluke rigs","Soft plastics"}	{"Drift fishing",Bucktailing,"Bottom bouncing","Fluke rigs"}	Beginner	Flounder start life as normal-looking fish swimming upright. As they mature, one eye migrates to the other side of their head, and they begin their life as a flatfish on the ocean floor.	Managed through size and bag limits. Summer flounder populations have recovered significantly since the 1990s.	t	2026-09-23 06:22:40.607985+00	2026-09-23 06:25:15.274671+00
f4245ea5-998b-4420-980d-ab208d792070	Bluefish	Pomatomus saltatrix	saltwater	Pelagic	Bluefish are voracious predators known for their aggressive feeding frenzies. They travel in large schools and will attack anything that moves, making them exciting to catch.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192472527_46f0d4b3.png	Atlantic coast from Maine to Florida. Found in surf, bays, inlets, and offshore waters. They migrate north in summer and south in winter following baitfish schools.	3-10 lbs, 18-28 inches	31 lbs 12 oz (James Hussey, 1972)	{Summer,Fall}	Fall (migration feeding frenzy)	{"Cut bunker","Live mullet",Clams,Squid}	{"Metal spoons",Poppers,Swimmers,"Diamond jigs"}	{"Surf casting",Trolling,Chumming,Jigging,"Fly fishing"}	Beginner	Bluefish are such aggressive feeders that they will continue killing and eating even when full. During a feeding frenzy, they can turn the water into a boiling, bloody mess.	Populations have declined. New management measures aim to rebuild stocks.	t	2026-09-23 06:22:40.926957+00	2026-09-23 06:25:15.667372+00
d35fa0c7-50e1-4925-94cb-049089924e88	Kokanee Salmon	Oncorhynchus nerka	freshwater	Salmon	Kokanee are the landlocked form of sockeye salmon. They spend their entire lives in freshwater lakes and are popular targets for trolling anglers in western reservoirs.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192497120_b4db6925.jpg	Deep, cold lakes and reservoirs in the western US. They feed on zooplankton in open water and spawn in tributary streams or along lake shorelines.	1-3 lbs, 10-16 inches	9 lbs 6 oz (Ron Campbell, 1988)	{Summer,Fall}	Summer (open water trolling)	{Corn,Maggots,"Kokanee-scented baits"}	{"Wedding Ring spinners","Dodgers with hoochies","Small spoons","Apex lures"}	{"Trolling with downriggers",Long-lining,Jigging,"Shore fishing during spawn"}	Intermediate	Like their ocean-going cousins, kokanee turn bright red and develop hooked jaws when they spawn. They die after spawning, just like Pacific salmon.	Maintained through stocking programs in most waters. Natural reproduction occurs in some lakes.	t	2026-09-23 06:22:41.594469+00	2026-09-23 06:25:16.325773+00
4dee94f3-6636-4427-a902-639968d23c0c	Rainbow Trout	Oncorhynchus mykiss	freshwater	Trout	Rainbow trout are one of the most widely distributed and popular sport fish in North America. Named for the distinctive pink-red stripe along their sides, they are a favorite of fly fishers worldwide.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192401791_242b7874.png	Cold, clear streams, rivers, and lakes with water temperatures between 50-65°F. Found in mountain streams, tailwaters below dams, and stocked in lakes and ponds across the country.	1-3 lbs, 12-18 inches	48 lbs (Sean Konrad, 2009)	{Spring,Fall,Winter}	Spring (insect hatches)	{PowerBait,"Salmon eggs",Nightcrawlers,Corn,Mealworms}	{"Spinners (Rooster Tails)",Spoons,"Small crankbaits","Fly patterns (dry & nymph)"}	{"Fly fishing","Drift fishing","Spinner fishing","Float fishing",Trolling}	Beginner	Rainbow trout that migrate to the ocean and return to freshwater to spawn are called steelhead - same species, different lifestyle!	Native to Pacific coast watersheds. Widely stocked across the US. Wild populations face threats from habitat loss and competition with non-native species.	t	2026-09-23 06:22:31.986583+00	2026-09-23 06:25:06.562726+00
1ff23f3a-7291-4889-a18f-07c7a7907496	Brook Trout	Salvelinus fontinalis	freshwater	Trout	The only trout native to the eastern United States, brook trout (technically a char) are beloved for their stunning coloration and willingness to take flies. They require the coldest, cleanest water.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192406734_0fecd7f3.png	Small, cold mountain streams and spring-fed ponds with water temperatures below 65°F. Found in the Appalachian Mountains, New England, and the upper Midwest.	6-12 inches, 0.25-1 lb	14 lbs 8 oz (Dr. W.J. Cook, 1916)	{Spring,Summer,Fall}	Spring (early season hatches)	{Worms,"Small minnows",Insects,"Salmon eggs"}	{"Small spinners","Dry flies",Nymphs,"Small spoons"}	{"Fly fishing","Ultralight spinning","Brook fishing",Dapping}	Beginner	Brook trout have the most beautiful coloration of any freshwater fish, with blue halos around red spots on their sides and white-edged fins.	Native populations declining due to habitat loss, warming waters, and competition from non-native species. Many conservation efforts are underway.	t	2026-09-23 06:22:32.64393+00	2026-09-23 06:25:07.233971+00
18655f95-22db-4582-942d-1072f0565a4d	Sockeye Salmon	Oncorhynchus nerka	anadromous	Salmon	Sockeye salmon are famous for their bright red spawning coloration and their incredible upstream migrations. They are the most commercially valuable Pacific salmon species.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192518391_866e605c.jpg	Pacific Ocean and rivers with lake systems for juvenile rearing. Most abundant in Alaska and British Columbia. Require lakes as part of their life cycle.	5-8 lbs, 20-26 inches	15 lbs 3 oz (Stan Roach, 1987)	{Summer}	Summer (June-August runs)	{"Salmon eggs (where legal)","Flies only in many areas"}	{"Small spinners","Coho flies","Egg-sucking leeches","Bead patterns"}	{"Fly fishing",Flossing,"Float fishing","Combat fishing"}	Advanced	Sockeye salmon turn brilliant red and develop a humped back and hooked jaw when they return to freshwater to spawn - a dramatic transformation from their silver ocean form.	Some runs are endangered while others (especially in Alaska) remain abundant. Climate change is affecting run timing.	t	2026-09-23 06:22:35.998083+00	2026-09-23 06:25:10.6026+00
cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	Crappie	Pomoxis spp.	freshwater	Panfish	Crappie (both black and white species) are among the most popular panfish in America. They school in large numbers and are known for their delicate, flaky white meat.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192379829_5571e16f.jpg	Lakes, reservoirs, and slow rivers with brush piles, standing timber, and docks. They move shallow in spring to spawn and retreat to deeper water in summer and winter.	0.5-1.5 lbs, 9-12 inches	5 lbs 7 oz (Fred Bright, 2018)	{Spring,Fall}	Spring (spawning season)	{Minnows,"Wax worms","Small jigs tipped with minnows"}	{"Small jigs (1/16-1/8 oz)","Tube jigs","Curly tail grubs","Small crankbaits"}	{"Spider rigging","Dock shooting","Bobber fishing","Vertical jigging","Long-line trolling"}	Beginner	Crappie are called 'papermouth' because their thin, papery mouths tear easily. Anglers must use a gentle touch when setting the hook and fighting these fish.	Abundant throughout their range. Populations can boom and bust based on year-class strength.	t	2026-09-23 06:22:36.96771+00	2026-09-23 06:25:11.595115+00
c8707d8f-77d8-48fc-ab59-5ad55e7763f2	Paddlefish	Polyodon spathula	freshwater	Primitive	Paddlefish are ancient, prehistoric fish with a distinctive paddle-shaped snout. They are filter feeders that can grow to enormous sizes and are caught by snagging in most states.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192549640_5ef8eeaa.png	Large rivers and reservoirs in the Mississippi River basin. They prefer deep, slow-moving water with abundant zooplankton.	20-40 lbs, 36-50 inches	144 lbs (Mitch Looper, 2004)	{Spring}	Spring (spawning migration, March-May)	{"Not applicable - caught by snagging"}	{"Large treble hooks (snagging rigs)","Heavy weights"}	{Snagging,"Bow fishing (where legal)"}	Intermediate	Paddlefish are one of only two surviving species of paddlefish in the world. They have existed for over 300 million years!	Vulnerable to overfishing and habitat loss. Many states have strict regulations.	t	2026-09-23 06:22:42.263026+00	2026-09-23 06:25:16.991252+00
07c23446-2fa0-4649-ae57-5bcb4305277f	Yellowtail	Seriola lalandi	saltwater	Gamefish	Yellowtail are powerful, fast-swimming fish prized by Southern California and Baja Mexico anglers. They are incredible fighters known for long, powerful runs.	https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192546857_fc057975.jpg	Temperate Pacific waters from Southern California to Baja Mexico. Found near kelp beds, rocky reefs, islands, and offshore banks.	10-25 lbs, 24-40 inches	80 lbs 11 oz (David Casillas, 2000)	{Spring,Summer,Fall}	Summer (warm water influx)	{"Live sardines","Live mackerel",Squid}	{"Iron jigs","Surface irons",Swimbaits,"Yo-yo jigs"}	{"Live bait fishing","Surface iron casting","Yo-yo jigging",Trolling,"Fly fishing"}	Intermediate	Yellowtail are known for their incredible initial runs when hooked. They will often head straight for the nearest kelp bed or structure to try to break the line.	Well-managed in US waters. Mexican waters have fewer regulations but populations remain healthy.	t	2026-09-23 06:22:42.918247+00	2026-09-23 06:25:17.663201+00
\.


--
-- Data for Name: fishing_spot_species; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".fishing_spot_species (fishing_spot_id, species_id, notes, created_at) FROM stdin;
49	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:54:28.932202+00
49	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:54:28.932202+00
49	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:54:28.932202+00
49	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:54:28.932202+00
50	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:54:43.612755+00
50	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 11:54:43.612755+00
50	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:54:43.612755+00
50	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:54:43.612755+00
125	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 09:37:02.558063+00
125	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 09:37:02.558063+00
125	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 09:37:02.558063+00
122	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 09:39:20.069289+00
122	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 09:39:20.069289+00
122	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 09:39:20.069289+00
122	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 09:39:20.069289+00
25	60906d64-65dc-4e98-a18d-33438a97de0a	\N	2026-09-23 09:54:58.915624+00
25	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 09:54:58.915624+00
25	203622e6-46ea-4e8d-a537-50a3c4a42c4a	\N	2026-09-23 09:54:58.915624+00
25	a9bb507d-ae6e-45fb-9a9a-b5d85cebc57c	\N	2026-09-23 09:54:58.915624+00
30	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:48:23.674123+00
30	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:48:23.674123+00
30	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:48:23.674123+00
30	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:48:23.674123+00
30	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:48:23.674123+00
53	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:55:37.033075+00
53	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:55:37.033075+00
60	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:57:04.567022+00
60	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:57:04.567022+00
60	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:57:04.567022+00
60	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:57:04.567022+00
60	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:57:04.567022+00
69	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:59:29.678363+00
69	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 11:59:29.678363+00
69	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 11:59:29.678363+00
69	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:59:29.678363+00
96	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:08:26.943475+00
96	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:08:26.943475+00
96	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:08:26.943475+00
96	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:08:26.943475+00
96	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:08:26.943475+00
98	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:08:54.36897+00
98	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:08:54.36897+00
98	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:08:54.36897+00
98	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:08:54.36897+00
146	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:18:44.354152+00
146	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:18:44.354152+00
146	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:18:44.354152+00
146	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:18:44.354152+00
146	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:18:44.354152+00
158	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:27:00.907111+00
158	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:27:00.907111+00
158	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:27:00.907111+00
158	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:27:00.907111+00
158	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:27:00.907111+00
9	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:22:51.541188+00
9	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:22:51.541188+00
9	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 06:22:51.541188+00
9	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 06:22:51.541188+00
13	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:22:55.434767+00
13	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:22:55.434767+00
13	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:22:55.434767+00
13	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:22:55.434767+00
14	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:22:56.08955+00
14	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:22:56.08955+00
14	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 06:22:56.08955+00
15	d35fa0c7-50e1-4925-94cb-049089924e88	\N	2026-09-23 06:22:56.7657+00
15	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:22:56.7657+00
15	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:22:56.7657+00
15	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:22:56.7657+00
17	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:22:58.793665+00
17	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:22:58.793665+00
17	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:22:58.793665+00
18	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:23:00.098456+00
18	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 06:23:00.098456+00
18	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 06:23:00.098456+00
21	da5fb3b3-8190-45fd-8407-cb7d148b572c	\N	2026-09-23 06:23:03.926396+00
21	203622e6-46ea-4e8d-a537-50a3c4a42c4a	\N	2026-09-23 06:23:03.926396+00
23	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 06:23:05.588383+00
23	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:05.588383+00
23	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:23:05.588383+00
23	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:23:05.588383+00
26	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:08.801258+00
26	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:23:08.801258+00
27	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:09.448268+00
27	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:09.448268+00
27	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:23:09.448268+00
27	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 06:23:09.448268+00
52	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:55:10.185426+00
52	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:55:10.185426+00
52	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:55:10.185426+00
32	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:13.399202+00
32	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:23:13.399202+00
32	24fbaae8-d9f1-4a2a-9b95-72e475fd99fe	\N	2026-09-23 06:23:13.399202+00
52	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:55:10.185426+00
102	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:09:54.969156+00
153	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 12:21:52.041528+00
153	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 12:21:52.041528+00
153	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:21:52.041528+00
102	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:09:54.969156+00
102	24fbaae8-d9f1-4a2a-9b95-72e475fd99fe	\N	2026-09-23 12:09:54.969156+00
102	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:09:54.969156+00
31	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:48:37.706814+00
31	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:48:37.706814+00
124	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 09:37:31.514861+00
124	c5904e68-10a5-4205-ad87-8690b6e7fbbc	\N	2026-09-23 09:37:31.514861+00
124	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 09:37:31.514861+00
107	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 09:41:25.021897+00
107	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 09:41:25.021897+00
31	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:48:37.706814+00
31	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:48:37.706814+00
31	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:48:37.706814+00
41	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 11:50:47.059618+00
41	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 11:50:47.059618+00
41	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:50:47.059618+00
41	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:50:47.059618+00
54	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:55:46.997826+00
54	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:55:46.997826+00
54	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:55:46.997826+00
54	c8707d8f-77d8-48fc-ab59-5ad55e7763f2	\N	2026-09-23 11:55:46.997826+00
54	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:55:46.997826+00
103	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:10:15.258549+00
103	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:10:15.258549+00
103	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:10:15.258549+00
103	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:10:15.258549+00
103	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:10:15.258549+00
123	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 09:38:30.972821+00
123	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 09:38:30.972821+00
34	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:49:17.67665+00
34	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:49:17.67665+00
34	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:49:17.67665+00
123	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 09:38:30.972821+00
34	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:49:17.67665+00
38	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:18.021422+00
38	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:18.021422+00
38	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:18.021422+00
40	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:19.321408+00
40	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:23:19.321408+00
40	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:23:19.321408+00
48	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:26.481491+00
48	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:26.481491+00
48	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 06:23:26.481491+00
48	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:26.481491+00
55	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:31.439695+00
55	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 06:23:31.439695+00
55	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:23:31.439695+00
55	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:31.439695+00
56	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 06:23:32.468591+00
56	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:32.468591+00
56	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:32.468591+00
57	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:33.127769+00
57	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:33.127769+00
57	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:33.127769+00
57	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:23:33.127769+00
59	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:34.756816+00
59	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:34.756816+00
59	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:34.756816+00
59	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:23:34.756816+00
156	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:26:25.102752+00
156	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:26:25.102752+00
156	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:26:25.102752+00
58	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:56:43.080178+00
156	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:26:25.102752+00
156	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:26:25.102752+00
156	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:26:25.102752+00
58	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:56:43.080178+00
58	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:56:43.080178+00
58	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:56:43.080178+00
66	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:58:57.415562+00
51	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 09:46:45.899199+00
51	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 09:46:45.899199+00
51	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 09:46:45.899199+00
51	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 09:46:45.899199+00
51	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 09:46:45.899199+00
66	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:58:57.415562+00
35	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:49:43.247754+00
35	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:49:43.247754+00
35	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:49:43.247754+00
35	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:49:43.247754+00
35	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:49:43.247754+00
44	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:52:26.344169+00
44	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:52:26.344169+00
44	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:52:26.344169+00
44	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 11:52:26.344169+00
44	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:52:26.344169+00
66	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:58:57.415562+00
66	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:58:57.415562+00
104	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:10:38.420428+00
104	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 12:10:38.420428+00
104	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:10:38.420428+00
104	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:10:38.420428+00
104	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:10:38.420428+00
159	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:27:48.347975+00
159	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:27:48.347975+00
61	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 11:57:21.074886+00
61	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:57:21.074886+00
36	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 09:48:38.179035+00
159	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:27:48.347975+00
159	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 12:27:48.347975+00
159	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:27:48.347975+00
36	4ddb8d28-7b6e-44ab-90e6-a871f6ccdddc	\N	2026-09-23 09:48:38.179035+00
36	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 09:48:38.179035+00
70	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:00:03.367733+00
121	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 10:00:38.856721+00
121	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 10:00:38.856721+00
121	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 10:00:38.856721+00
37	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:50:02.194226+00
37	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:50:02.194226+00
37	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:50:02.194226+00
37	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:50:02.194226+00
70	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:00:03.367733+00
70	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:00:03.367733+00
70	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:00:03.367733+00
70	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:00:03.367733+00
108	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:11:23.714843+00
108	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:11:23.714843+00
108	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:11:23.714843+00
108	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:11:23.714843+00
108	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:11:23.714843+00
65	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:23:39.739843+00
65	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:39.739843+00
65	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:39.739843+00
65	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:39.739843+00
143	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:37.067187+00
8	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 07:30:06.149637+00
8	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 07:30:06.149637+00
62	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 11:57:34.448695+00
62	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:57:34.448695+00
62	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:57:34.448695+00
62	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:57:34.448695+00
4	18655f95-22db-4582-942d-1072f0565a4d	\N	2026-09-23 11:34:23.948925+00
4	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:34:23.948925+00
4	8fb47dda-b961-457f-9a66-448822fe0bbf	\N	2026-09-23 11:34:23.948925+00
4	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:34:23.948925+00
39	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 11:50:32.028227+00
39	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 11:50:32.028227+00
39	da5fb3b3-8190-45fd-8407-cb7d148b572c	\N	2026-09-23 11:50:32.028227+00
39	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:50:32.028227+00
110	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:11:57.518226+00
110	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:11:57.518226+00
110	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 12:11:57.518226+00
110	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:11:57.518226+00
110	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:11:57.518226+00
161	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:28:24.900988+00
161	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:28:24.900988+00
161	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:28:24.900988+00
161	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:28:24.900988+00
67	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:41.104507+00
67	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:41.104507+00
63	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:57:57.517016+00
157	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:49.609977+00
160	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:52.444009+00
63	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 11:57:57.517016+00
63	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 11:57:57.517016+00
42	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:51:08.260283+00
42	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:51:08.260283+00
42	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 11:51:08.260283+00
42	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:51:08.260283+00
63	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:57:57.517016+00
113	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:12:29.880178+00
113	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:12:29.880178+00
113	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:12:29.880178+00
113	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:12:29.880178+00
113	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:12:29.880178+00
162	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:28:57.719682+00
162	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:28:57.719682+00
162	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:28:57.719682+00
162	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:28:57.719682+00
162	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:28:57.719682+00
162	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:28:57.719682+00
68	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:23:41.760521+00
68	a04b3406-7811-46e6-9291-1f1bb675eb0c	\N	2026-09-23 06:23:41.760521+00
68	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:23:41.760521+00
68	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:41.760521+00
1	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 10:13:35.426914+00
183	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:04:55.875313+00
183	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 08:04:55.875313+00
183	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 08:04:55.875313+00
183	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 08:04:55.875313+00
183	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 08:04:55.875313+00
1	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 10:13:35.426914+00
1	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 10:13:35.426914+00
1	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 10:13:35.426914+00
43	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:51:39.283114+00
43	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 11:51:39.283114+00
43	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:51:39.283114+00
43	4ddb8d28-7b6e-44ab-90e6-a871f6ccdddc	\N	2026-09-23 11:51:39.283114+00
64	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:58:32.742847+00
64	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 11:58:32.742847+00
64	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:58:32.742847+00
118	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:13:03.587129+00
118	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:13:03.587129+00
118	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:13:03.587129+00
118	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:13:03.587129+00
127	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:13:57.062996+00
127	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:13:57.062996+00
127	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:13:57.062996+00
164	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:29:43.10631+00
164	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:29:43.10631+00
164	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:29:43.10631+00
164	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:29:43.10631+00
164	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:29:43.10631+00
154	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:24:47.041834+00
2	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:23:04.646533+00
165	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:30:12.590964+00
165	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:30:12.590964+00
2	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:23:04.646533+00
165	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:30:12.590964+00
165	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:30:12.590964+00
2	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:23:04.646533+00
2	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:23:04.646533+00
2	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:23:04.646533+00
45	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:53:04.659348+00
45	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 11:53:04.659348+00
45	6b3f619c-a582-4691-b14e-098f879509ad	\N	2026-09-23 11:53:04.659348+00
45	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:53:04.659348+00
45	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 11:53:04.659348+00
46	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 11:53:27.077405+00
46	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:53:27.077405+00
46	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:53:27.077405+00
46	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:53:27.077405+00
72	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:00:26.991292+00
72	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:00:26.991292+00
72	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:00:26.991292+00
72	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:00:26.991292+00
86	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 12:06:09.468187+00
86	da5fb3b3-8190-45fd-8407-cb7d148b572c	\N	2026-09-23 12:06:09.468187+00
86	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:06:09.468187+00
90	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:06:59.379652+00
90	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:06:59.379652+00
90	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:06:59.379652+00
90	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:06:59.379652+00
131	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:14:54.403253+00
131	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:14:54.403253+00
131	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:14:54.403253+00
71	60906d64-65dc-4e98-a18d-33438a97de0a	\N	2026-09-23 06:23:44.016571+00
71	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 06:23:44.016571+00
71	a9bb507d-ae6e-45fb-9a9a-b5d85cebc57c	\N	2026-09-23 06:23:44.016571+00
71	203622e6-46ea-4e8d-a537-50a3c4a42c4a	\N	2026-09-23 06:23:44.016571+00
73	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:45.338993+00
73	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:45.338993+00
73	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:45.338993+00
73	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:23:45.338993+00
73	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:23:45.338993+00
75	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:46.628112+00
75	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 06:23:46.628112+00
75	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:23:46.628112+00
75	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:46.628112+00
78	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:48.932463+00
78	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:48.932463+00
78	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:48.932463+00
78	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:48.932463+00
79	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:23:49.587226+00
79	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:23:49.587226+00
79	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:23:49.587226+00
79	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:23:49.587226+00
87	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:56.081556+00
87	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:23:56.081556+00
87	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:56.081556+00
87	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:56.081556+00
88	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:56.735551+00
88	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:23:56.735551+00
88	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:56.735551+00
88	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:56.735551+00
89	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:23:57.391998+00
89	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:57.391998+00
89	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:23:57.391998+00
89	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:23:57.391998+00
94	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:24:00.991237+00
94	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:00.991237+00
94	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:00.991237+00
94	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:00.991237+00
94	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:00.991237+00
95	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:01.728556+00
95	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:01.728556+00
95	701be5f7-eb3d-4da3-8090-a0ce99374b8d	\N	2026-09-23 06:24:01.728556+00
97	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:03.512693+00
97	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 06:24:03.512693+00
97	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:03.512693+00
99	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:24:04.988183+00
99	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:04.988183+00
99	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:04.988183+00
99	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:04.988183+00
100	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:24:05.691939+00
167	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 12:30:54.701407+00
3	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 11:25:49.303001+00
167	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:30:54.701407+00
167	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:30:54.701407+00
3	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:25:49.303001+00
47	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:53:57.587803+00
47	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 11:53:57.587803+00
100	a04b3406-7811-46e6-9291-1f1bb675eb0c	\N	2026-09-23 06:24:05.691939+00
100	6ea5e4b9-28cf-47b7-8bd2-34e8f11f5172	\N	2026-09-23 06:24:05.691939+00
100	6b3f619c-a582-4691-b14e-098f879509ad	\N	2026-09-23 06:24:05.691939+00
47	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 11:53:57.587803+00
101	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:24:06.353212+00
101	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:24:06.353212+00
101	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 06:24:06.353212+00
101	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:06.353212+00
47	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:53:57.587803+00
167	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:30:54.701407+00
47	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:53:57.587803+00
167	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:30:54.701407+00
167	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:30:54.701407+00
74	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:01:15.942358+00
74	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 12:01:15.942358+00
105	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:09.309614+00
105	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:09.309614+00
105	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:09.309614+00
105	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:09.309614+00
111	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:13.584845+00
111	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:24:13.584845+00
111	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:13.584845+00
111	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:13.584845+00
74	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:01:15.942358+00
74	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:01:15.942358+00
84	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:05:26.551966+00
84	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 12:05:26.551966+00
84	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 12:05:26.551966+00
132	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:15:23.562585+00
132	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:15:23.562585+00
132	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:15:23.562585+00
132	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:15:23.562585+00
132	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 12:15:23.562585+00
169	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:31:37.692757+00
169	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 12:31:37.692757+00
169	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:31:37.692757+00
169	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:31:37.692757+00
169	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:31:37.692757+00
171	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:27:34.803024+00
171	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:27:34.803024+00
171	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:27:34.803024+00
171	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:27:34.803024+00
171	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:27:34.803024+00
171	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:27:34.803024+00
5	18655f95-22db-4582-942d-1072f0565a4d	\N	2026-09-23 11:35:24.938553+00
5	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 11:35:24.938553+00
5	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:35:24.938553+00
5	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:35:24.938553+00
76	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:02:01.128062+00
76	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:02:01.128062+00
76	24fbaae8-d9f1-4a2a-9b95-72e475fd99fe	\N	2026-09-23 12:02:01.128062+00
76	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:02:01.128062+00
85	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:05:44.988687+00
85	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:05:44.988687+00
85	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:05:44.988687+00
85	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:05:44.988687+00
85	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:05:44.988687+00
134	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:15:57.360464+00
134	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:15:57.360464+00
134	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:15:57.360464+00
134	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:15:57.360464+00
134	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:15:57.360464+00
134	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 12:15:57.360464+00
172	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:32:18.34505+00
172	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:32:18.34505+00
172	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:32:18.34505+00
172	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:32:18.34505+00
173	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:32:37.800692+00
173	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:32:37.800692+00
173	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:32:37.800692+00
173	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:32:37.800692+00
6	6b3f619c-a582-4691-b14e-098f879509ad	\N	2026-09-23 11:36:21.982075+00
173	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:32:37.800692+00
6	6ea5e4b9-28cf-47b7-8bd2-34e8f11f5172	\N	2026-09-23 11:36:21.982075+00
173	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:32:37.800692+00
6	a04b3406-7811-46e6-9291-1f1bb675eb0c	\N	2026-09-23 11:36:21.982075+00
6	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:36:21.982075+00
77	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:03:29.830426+00
179	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:27:40.664276+00
179	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:27:40.664276+00
179	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:27:40.664276+00
179	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:27:40.664276+00
179	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:27:40.664276+00
77	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:03:29.830426+00
77	c8707d8f-77d8-48fc-ab59-5ad55e7763f2	\N	2026-09-23 12:03:29.830426+00
77	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:03:29.830426+00
77	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:03:29.830426+00
135	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:16:20.860642+00
135	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:16:20.860642+00
128	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:25.241373+00
128	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:25.241373+00
128	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:25.241373+00
155	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:31:34.512069+00
7	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:38:02.063055+00
7	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:38:02.063055+00
128	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:25.241373+00
129	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:25.923369+00
174	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:32:56.535902+00
174	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 12:32:56.535902+00
155	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 08:31:34.512069+00
155	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 08:31:34.512069+00
174	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:32:56.535902+00
174	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:32:56.535902+00
174	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:32:56.535902+00
174	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:32:56.535902+00
155	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 08:31:34.512069+00
129	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:25.923369+00
155	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 08:31:34.512069+00
142	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 08:34:17.686673+00
142	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 08:34:17.686673+00
129	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:25.923369+00
80	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 12:04:03.347007+00
80	a04b3406-7811-46e6-9291-1f1bb675eb0c	\N	2026-09-23 12:04:03.347007+00
80	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 12:04:03.347007+00
7	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:38:02.063055+00
7	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:38:02.063055+00
7	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:38:02.063055+00
80	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:04:03.347007+00
139	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:17:13.75044+00
139	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:17:13.75044+00
139	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:17:13.75044+00
139	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:17:13.75044+00
139	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:17:13.75044+00
139	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:17:13.75044+00
142	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 08:34:17.686673+00
142	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:34:17.686673+00
109	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:24:12.203053+00
109	d35fa0c7-50e1-4925-94cb-049089924e88	\N	2026-09-23 06:24:12.203053+00
109	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:12.203053+00
112	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:14.241721+00
112	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:14.241721+00
112	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 06:24:14.241721+00
112	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:14.241721+00
114	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:15.52773+00
114	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:15.52773+00
114	1ff23f3a-7291-4889-a18f-07c7a7907496	\N	2026-09-23 06:24:15.52773+00
115	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:16.169054+00
115	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 06:24:16.169054+00
115	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:16.169054+00
115	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:16.169054+00
116	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:24:16.807322+00
116	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:16.807322+00
116	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:16.807322+00
116	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:16.807322+00
117	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:24:17.455012+00
117	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:24:17.455012+00
117	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 06:24:17.455012+00
119	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:18.745524+00
119	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:18.745524+00
119	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:18.745524+00
120	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:19.382192+00
120	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:19.382192+00
120	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:24:19.382192+00
130	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:26.550492+00
130	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:26.550492+00
130	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:26.550492+00
130	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:26.550492+00
133	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:29.46502+00
133	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:29.46502+00
133	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:29.46502+00
133	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:29.46502+00
138	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:33.679779+00
138	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:33.679779+00
138	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:33.679779+00
138	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:33.679779+00
138	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:33.679779+00
150	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 08:32:58.200135+00
180	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:27:41.314139+00
180	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:27:41.314139+00
180	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:27:41.314139+00
180	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:27:41.314139+00
150	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:32:58.200135+00
150	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 08:32:58.200135+00
150	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 08:32:58.200135+00
150	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 08:32:58.200135+00
150	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 08:32:58.200135+00
10	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:38:18.883316+00
10	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:38:18.883316+00
10	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:38:18.883316+00
10	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:38:18.883316+00
10	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:38:18.883316+00
81	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 12:04:27.09055+00
81	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:04:27.09055+00
81	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:04:27.09055+00
81	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:04:27.09055+00
81	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 12:04:27.09055+00
175	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 12:33:13.904751+00
175	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:33:13.904751+00
175	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:33:13.904751+00
175	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:33:13.904751+00
175	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:33:13.904751+00
175	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:33:13.904751+00
147	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:33:33.133006+00
147	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 08:33:33.133006+00
147	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 08:33:33.133006+00
147	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 08:33:33.133006+00
137	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:35:14.503169+00
137	4ddb8d28-7b6e-44ab-90e6-a871f6ccdddc	\N	2026-09-23 08:35:14.503169+00
137	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 08:35:14.503169+00
11	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:38:52.776415+00
11	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 11:38:52.776415+00
11	d35fa0c7-50e1-4925-94cb-049089924e88	\N	2026-09-23 11:38:52.776415+00
11	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 11:38:52.776415+00
137	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 08:35:14.503169+00
12	07c23446-2fa0-4649-ae57-5bcb4305277f	\N	2026-09-23 11:39:39.18509+00
12	6ea5e4b9-28cf-47b7-8bd2-34e8f11f5172	\N	2026-09-23 11:39:39.18509+00
12	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 11:39:39.18509+00
12	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:39:39.18509+00
16	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:41:13.549056+00
16	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 11:41:13.549056+00
16	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 11:41:13.549056+00
16	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:41:13.549056+00
16	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:41:13.549056+00
82	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:04:44.658411+00
82	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 12:04:44.658411+00
82	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:04:44.658411+00
176	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:33:31.103294+00
176	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 12:33:31.103294+00
176	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:33:31.103294+00
176	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:33:31.103294+00
176	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:33:31.103294+00
176	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:33:31.103294+00
140	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:35.033334+00
140	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:35.033334+00
140	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:35.033334+00
140	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:35.033334+00
141	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:35.754822+00
141	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:24:35.754822+00
141	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:35.754822+00
141	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:35.754822+00
141	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:35.754822+00
143	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:37.067187+00
143	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:37.067187+00
143	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:37.067187+00
143	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:37.067187+00
144	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:37.718167+00
144	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:37.718167+00
144	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:37.718167+00
145	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:38.841779+00
145	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:38.841779+00
145	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:38.841779+00
145	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:38.841779+00
148	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:41.339637+00
148	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:41.339637+00
148	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:41.339637+00
148	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:41.339637+00
149	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:42.044855+00
149	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:42.044855+00
149	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:42.044855+00
149	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:42.044855+00
151	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:43.365152+00
151	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:43.365152+00
151	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:43.365152+00
151	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:43.365152+00
154	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:47.041834+00
154	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:47.041834+00
154	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:47.041834+00
154	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:47.041834+00
157	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:49.609977+00
157	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:49.609977+00
157	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:49.609977+00
157	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:49.609977+00
160	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:52.444009+00
160	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:24:52.444009+00
160	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:52.444009+00
160	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:52.444009+00
163	d35fa0c7-50e1-4925-94cb-049089924e88	\N	2026-09-23 06:24:54.417806+00
163	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:54.417806+00
163	56c9e4d0-9670-4300-9ee6-1ca88f629dc4	\N	2026-09-23 06:24:54.417806+00
163	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:54.417806+00
163	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:54.417806+00
136	f9279e99-f956-4907-8b13-210d5de15680	\N	2026-09-23 08:35:23.721987+00
136	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 08:35:23.721987+00
136	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 08:35:23.721987+00
136	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 08:35:23.721987+00
136	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 08:35:23.721987+00
19	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:42:16.154382+00
19	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:42:16.154382+00
19	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:42:16.154382+00
19	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:42:16.154382+00
83	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:05:09.241331+00
83	f4245ea5-998b-4420-980d-ab208d792070	\N	2026-09-23 12:05:09.241331+00
83	b8cf8f59-fb53-4440-82f0-82817fa78a5f	\N	2026-09-23 12:05:09.241331+00
83	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:05:09.241331+00
177	da5fb3b3-8190-45fd-8407-cb7d148b572c	\N	2026-09-23 12:34:00.825252+00
177	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:34:00.825252+00
177	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 12:34:00.825252+00
177	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 12:34:00.825252+00
181	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:34:50.21986+00
181	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:34:50.21986+00
181	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 12:34:50.21986+00
181	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:34:50.21986+00
20	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:42:29.899667+00
20	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 11:42:29.899667+00
20	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:42:29.899667+00
20	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:42:29.899667+00
91	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:07:16.771752+00
91	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:07:16.771752+00
91	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:07:16.771752+00
182	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:35:11.737115+00
182	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:35:11.737115+00
22	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:43:05.502761+00
166	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:56.749621+00
166	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:56.749621+00
166	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:56.749621+00
166	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:24:56.749621+00
22	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 11:43:05.502761+00
22	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:43:05.502761+00
168	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:58.132675+00
168	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 06:24:58.132675+00
168	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:58.132675+00
168	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:58.132675+00
22	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:43:05.502761+00
168	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:58.132675+00
170	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 06:24:59.451195+00
170	7d9d62f2-240f-48e6-afa4-c86d807331b9	\N	2026-09-23 06:24:59.451195+00
170	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 06:24:59.451195+00
170	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:59.451195+00
170	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 06:24:59.451195+00
170	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 06:24:59.451195+00
28	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:47:41.018034+00
28	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 11:47:41.018034+00
28	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:47:41.018034+00
28	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 11:47:41.018034+00
28	d35fa0c7-50e1-4925-94cb-049089924e88	\N	2026-09-23 11:47:41.018034+00
29	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 11:48:03.987657+00
29	a04b3406-7811-46e6-9291-1f1bb675eb0c	\N	2026-09-23 11:48:03.987657+00
29	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 11:48:03.987657+00
29	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 11:48:03.987657+00
29	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 11:48:03.987657+00
92	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 12:07:43.296866+00
92	203622e6-46ea-4e8d-a537-50a3c4a42c4a	\N	2026-09-23 12:07:43.296866+00
92	da5fb3b3-8190-45fd-8407-cb7d148b572c	\N	2026-09-23 12:07:43.296866+00
92	cdf792b7-7575-45b8-80ce-aa9c310644db	\N	2026-09-23 12:07:43.296866+00
182	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:35:11.737115+00
182	c8707d8f-77d8-48fc-ab59-5ad55e7763f2	\N	2026-09-23 12:35:11.737115+00
182	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:35:11.737115+00
126	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 09:36:31.350406+00
24	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 11:43:38.405905+00
24	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 11:43:38.405905+00
24	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 11:43:38.405905+00
126	7d59faaa-c410-46db-a020-26a60717cf11	\N	2026-09-23 09:36:31.350406+00
24	d09951e3-25b2-49c7-b311-c2c7af1572e4	\N	2026-09-23 11:43:38.405905+00
93	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:08:02.334152+00
93	a014f52d-8a29-45ee-b856-9efd24e8068f	\N	2026-09-23 12:08:02.334152+00
93	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:08:02.334152+00
126	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 09:36:31.350406+00
126	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 09:36:31.350406+00
184	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 12:35:46.52779+00
184	92dacbdc-9db8-40c7-b108-10b669dcd29b	\N	2026-09-23 12:35:46.52779+00
184	cb1a34f6-7b4c-4c3c-8ec7-7df974ff520e	\N	2026-09-23 12:35:46.52779+00
33	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:23:14.374003+00
33	d598219e-93bb-44a9-87df-757f180c6a2f	\N	2026-09-23 06:23:14.374003+00
33	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:14.374003+00
33	3138d303-9b9b-48af-bd08-b4fbae411d2d	\N	2026-09-23 06:23:14.374003+00
184	aa12d78f-5acc-4815-9923-5608bc6722d1	\N	2026-09-23 12:35:46.52779+00
57	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:23:33.127769+00
89	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:23:57.391998+00
106	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:24:09.965162+00
106	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:24:09.965162+00
106	71def261-17c0-4add-b88c-4c857a79fadf	\N	2026-09-23 06:24:09.965162+00
109	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:24:12.203053+00
178	052220aa-f8a7-4f8a-bff8-66d4dde06709	\N	2026-09-23 06:27:40.003176+00
178	df1c01e4-dffa-4b2a-9bcc-55c4201ed8b7	\N	2026-09-23 06:27:40.003176+00
178	7b495ab8-b416-4b4d-8126-e6dfd8cb46e7	\N	2026-09-23 06:27:40.003176+00
178	4dee94f3-6636-4427-a902-639968d23c0c	\N	2026-09-23 06:27:40.003176+00
178	0ebf100b-47b6-418e-9fd7-ff0592746215	\N	2026-09-23 06:27:40.003176+00
\.


--
-- Data for Name: fishing_spots; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".fishing_spots (name, slug, description, state, city, county, country, address, latitude, longitude, water_type, access_type, public_access, private_access, permit_required, permit_information, best_seasons, fishing_notes, image_url, website_url, status, created_at, updated_at, id) FROM stdin;
Mobile Bay	mobile-bay-3	Massive estuary system offering year-round inshore saltwater fishing.	Alabama	Mobile	\N	USA	Mobile Bay, Mobile, AL 36602	30.695400	-88.039900	ocean	\N	t	f	t	Free (License Required)	Fall	Wade fish the grass flats for speckled trout at dawn\nUse live shrimp under a popping cork\nTarget oyster reefs for sheepshead with fiddler crabs	\N	\N	active	2026-09-23 06:22:45.067187+00	2026-09-23 06:22:45.067187+00	3
Kenai River	kenai-river-4	World-famous for trophy king salmon fishing with runs exceeding 50 lbs.	Alaska	Soldotna	\N	USA	Kenai River, Soldotna, AK 99669	60.486200	-150.108900	river	\N	t	f	t	Free (License Required)	Summer	Book a drift boat guide for king salmon in July\nUse bead patterns for rainbow trout in fall\nCombat fish for sockeye in the Russian River confluence	\N	\N	active	2026-09-23 06:22:46.714636+00	2026-09-23 06:22:46.714636+00	4
Bristol Bay	bristol-bay-5	The world's greatest wild salmon fishery with pristine wilderness rivers.	Alaska	Dillingham	\N	USA	Bristol Bay, Dillingham, AK 99576	58.800000	-158.500000	ocean	\N	f	t	t	Fly-in Lodge ($3,000-8,000/week)	Summer	Plan trips for late June for king salmon\nJuly is prime for sockeye runs\nSeptember offers trophy rainbow trout on mouse patterns	\N	\N	active	2026-09-23 06:22:47.669663+00	2026-09-23 06:22:47.669663+00	5
Resurrection Bay	resurrection-bay-6	Deep-water fishing paradise near Seward with stunning glacial scenery.	Alaska	Seward	\N	USA	Resurrection Bay, Seward, AK 99664	60.104200	-149.442200	ocean	\N	f	t	t	Charter ($250-400/person)	Summer	Book halibut charters May-August\nUse herring for silver salmon in August\nFish deep structure for lingcod with large jigs	\N	\N	active	2026-09-23 06:22:48.655205+00	2026-09-23 06:22:48.655205+00	6
Lake Ouachita	lake-ouachita-10	Crystal-clear Ouachita Mountain lake known for exceptional striped bass fishing.	Arkansas	Hot Springs	\N	USA	Lake Ouachita, Hot Springs, AR 71913	34.500000	-93.050000	lake	\N	t	f	t	Free (License Required)	Spring	Fish points and humps for stripers with live shad\nTarget standing timber for crappie\nUse finesse techniques in the ultra-clear water	\N	\N	active	2026-09-23 06:22:51.859192+00	2026-09-23 06:22:51.859192+00	10
Colorado River - Lees Ferry	colorado-river-lees-ferry-8	Crystal-clear tailwater below Glen Canyon Dam with trophy trout in a desert canyon.	Arizona	Marble Canyon	\N	USA	Lees Ferry, Marble Canyon, AZ 86036	36.870000	-111.590000	river	\N	t	f	f	Free (License Required)	Year-round	Use San Juan worms and midges year-round\nDrift boat fishing covers the most water\nFish early morning for rising trout on dry flies	\N	\N	active	2026-09-23 06:22:50.586839+00	2026-09-23 06:22:50.586839+00	8
Lake Powell	lake-powell-7	Stunning red-rock reservoir with 2,000 miles of shoreline and excellent striper fishing.	Arizona	Page	\N	USA	Lake Powell, Page, AZ 86040	37.070000	-111.250000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Chase boiling stripers with topwater lures in fall\nFish canyon walls for smallmouth with drop shots\nTroll deep for walleye near the dam	\N	\N	active	2026-09-23 06:22:49.954511+00	2026-09-23 06:22:49.954511+00	7
Lake Tahoe	lake-tahoe-11	Crystal clear alpine lake straddling California and Nevada with trophy mackinaw.	California	Lake Tahoe	\N	USA	Lake Tahoe, CA 96150	39.096800	-120.032400	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Troll deep for mackinaw with large spoons\nFish near shore in spring for rainbow trout\nTarget kokanee with dodger/hoochie combos in summer	\N	\N	active	2026-09-23 06:22:52.856266+00	2026-09-23 06:22:52.856266+00	11
San Diego Bay	san-diego-bay-12	Year-round fishing in Southern California's premier bay and offshore waters.	California	San Diego	\N	USA	San Diego Bay, San Diego, CA 92101	32.715700	-117.161100	ocean	\N	t	f	t	Free (License Required)	Summer	Book long-range trips for yellowfin tuna\nFish kelp beds for calico bass with swimbaits\nUse live sardines for yellowtail at the islands	\N	\N	active	2026-09-23 06:22:53.863173+00	2026-09-23 06:22:53.863173+00	12
Candlewood Lake	candlewood-lake-16	Connecticut's largest lake offering diverse warm and cold water fishing.	Connecticut	New Fairfield	\N	USA	Candlewood Lake, New Fairfield, CT 06812	41.400000	-73.470000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish rocky points for smallmouth in spring\nTarget weed edges for largemouth with soft plastics\nIce fish for walleye and perch in winter	\N	\N	active	2026-09-23 06:22:57.125158+00	2026-09-23 06:22:57.125158+00	16
White River	white-river-9	World-class tailwater trout fishery producing trophy browns over 20 lbs.	Arkansas	Bull Shoals	\N	USA	White River, Bull Shoals, AR 72619	36.380000	-92.580000	river	\N	t	f	t	Free (License Required)	Year-round	Fish sowbugs and scuds below Bull Shoals Dam\nTarget brown trout with streamers at dusk\nCheck generation schedules - low water is best for wading	\N	\N	active	2026-09-23 06:22:51.231561+00	2026-09-23 06:22:51.231561+00	9
Lums Pond	lums-pond-19	Delaware's largest freshwater pond with excellent bass and panfish.	Delaware	Bear	\N	USA	Lums Pond State Park, Bear, DE 19701	39.560000	-75.720000	lake	\N	t	f	t	State Park Fee + License	Spring	Fish lily pads for largemouth with frogs\nTarget fallen trees for crappie\nUse worms under a bobber for bluegill near shore	\N	\N	active	2026-09-23 06:23:00.533295+00	2026-09-23 06:23:00.533295+00	19
Sacramento River	sacramento-river-13	Northern California's premier salmon and steelhead river with year-round fishing.	California	Redding	\N	USA	Sacramento River, Redding, CA 96001	40.586500	-122.391700	river	\N	t	f	t	Free (License Required)	Fall & Winter	Drift roe for fall chinook salmon\nSwing flies for winter steelhead\nFish the upper river near Redding for wild trout	\N	\N	active	2026-09-23 06:22:55.112629+00	2026-09-23 06:22:55.112629+00	13
South Platte River	south-platte-river-14	Technical tailwater fishery in a stunning canyon with trophy trout on tiny flies.	Colorado	Deckers	\N	USA	Deckers, CO 80135	39.230000	-105.210000	river	\N	t	f	t	Free (License Required)	Year-round	Use size 22-26 midges in winter\nSight fish to rising trout in the Cheesman Canyon\nFish early morning before crowds arrive	\N	\N	active	2026-09-23 06:22:55.769549+00	2026-09-23 06:22:55.769549+00	14
Housatonic River	housatonic-river-17	Premier fly fishing river in New England with wild brown trout populations.	Connecticut	Cornwall	\N	USA	Housatonic River, Cornwall, CT 06796	41.840000	-73.360000	river	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the catch-and-release section in Cornwall\nMatch the hatch during spring caddis emergences\nUse streamers for large browns in fall	\N	\N	active	2026-09-23 06:22:58.474517+00	2026-09-23 06:22:58.474517+00	17
Delaware Bay	delaware-bay-18	Productive estuary with excellent surf fishing and bay fishing opportunities.	Delaware	Lewes	\N	USA	Delaware Bay, Lewes, DE 19958	38.774500	-75.139300	ocean	\N	t	f	t	Free (License Required)	Spring & Fall	Surf fish for stripers during the spring run\nDrift for flounder with live minnows in summer\nFish the Indian River Inlet for bluefish in fall	\N	\N	active	2026-09-23 06:22:59.112761+00	2026-09-23 06:22:59.112761+00	18
Wahiawa Reservoir	wahiawa-reservoir-26	Unique freshwater fishing in Hawaii with introduced bass species.	Hawaii	Wahiawa	\N	USA	Wahiawa Reservoir, Wahiawa, HI 96786	21.500000	-158.020000	lake	\N	t	f	t	Free (License Required)	Year-round	Fish early morning for peacock bass with topwater\nTarget structure for largemouth bass\nUse cut bait for catfish near the dam	\N	\N	active	2026-09-23 06:23:07.812789+00	2026-09-23 06:23:07.812789+00	26
Lake Cumberland	lake-cumberland-171	Kentucky's crown jewel lake with 1,255 miles of shoreline and trophy striped bass fishing. Houseboating and fishing combine for the ultimate family vacation.	Kentucky	Jamestown	\N	USA	Lake Cumberland, Jamestown, KY 42629	36.890000	-85.030000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Target trophy stripers with live shad near the dam\nFish rocky points for smallmouth with crawfish patterns\nThe Wolf Creek Dam tailwater has excellent trout fishing\nRent a houseboat and fish from it for a unique family experience	\N	\N	active	2026-09-23 06:27:34.495521+00	2026-09-23 06:27:34.495521+00	171
Pere Marquette River	pere-marquette-river-178	Michigan's most famous fly-fishing-only river section with world-class steelhead and salmon runs. The crystal-clear water and scenic forest setting make it a bucket-list destination.	Michigan	Baldwin	\N	USA	Pere Marquette River, Baldwin, MI 49304	43.900000	-85.850000	river	\N	t	f	t	Free (License Required)	Fall & Winter	Fish the flies-only section for wild brown trout with dry flies\nTarget steelhead October through April with egg patterns\nChinook salmon run in September - use large streamers\nBook a guided drift boat trip for the best experience	\N	\N	active	2026-09-23 06:27:39.696889+00	2026-09-23 06:27:39.696889+00	178
Kona Coast	kona-coast-25	World-famous big game fishing grounds known as the 'Marlin Capital of the World.'	Hawaii	Kailua-Kona	\N	USA	Kona Coast, Kailua-Kona, HI 96740	19.640000	-155.990000	ocean	\N	f	t	t	Charter ($600-1,500/trip)	Summer & Fall	Book charter boats for blue marlin July-September\nTroll lures along the ledge for ahi tuna\nFish FADs for mahi-mahi and ono	\N	\N	active	2026-09-23 06:23:06.869051+00	2026-09-23 06:23:06.869051+00	25
Lake Okeechobee	lake-okeechobee-20	One of the largest freshwater lakes in the US, famous for trophy bass fishing.	Florida	Okeechobee	\N	USA	900 Okeechobee Blvd, Okeechobee, FL 34974	26.968700	-80.829500	lake	\N	t	f	t	Free (License Required)	Winter & Spring	Fish the grass lines with wild shiners for trophy bass\nTarget the Monkey Box area for big bass\nUse artificial worms in the Kissimmee grass	\N	\N	active	2026-09-23 06:23:01.595119+00	2026-09-23 06:23:01.595119+00	20
Rend Lake	rend-lake-30	Southern Illinois gem known for outstanding crappie and bass fishing.	Illinois	Benton	\N	USA	Rend Lake, Benton, IL 62812	38.000000	-88.930000	lake	\N	t	f	t	Free (License Required)	Spring	Fish standing timber for crappie with jigs\nTarget riprap for bass in spring\nUse chicken liver for catfish near the spillway	\N	\N	active	2026-09-23 06:23:11.407953+00	2026-09-23 06:23:11.407953+00	30
Florida Keys	florida-keys-21	World-class flats fishing and offshore fishing in tropical paradise.	Florida	Key West	\N	USA	Florida Keys, Key West, FL 33040	24.555100	-81.780000	ocean	\N	t	f	t	Free (License Required)	Spring & Summer	Sight fish for tarpon in the backcountry channels in May\nWade the flats for bonefish with shrimp flies\nOffshore trolling for mahi-mahi and sailfish	\N	\N	active	2026-09-23 06:23:02.394359+00	2026-09-23 06:23:02.394359+00	21
Tenkiller Ferry Lake	tenkiller-ferry-lake-174	Oklahoma's 'Clear Water Jewel' with stunning bluffs and excellent scuba-clear visibility. The deep, clear water produces trophy spotted bass and is a favorite for swimming and cliff jumping.	Oklahoma	Vian	\N	USA	Lake Tenkiller, Vian, OK 74962	35.610000	-95.050000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish deep bluffs for spotted bass with drop shots and jerkbaits\nTarget walleye near the dam with jigs at night\nThe Illinois River arm has the best crappie fishing\nUse finesse techniques - the clear water demands light line	\N	\N	active	2026-09-23 06:27:36.430246+00	2026-09-23 06:27:36.430246+00	174
Monroe Lake	monroe-lake-183	Indiana's largest lake near Indiana University, offering excellent bass and crappie fishing. Paynetown State Recreation Area provides great family access with a beach and campground.	Indiana	Bloomington	\N	USA	Monroe Lake, Bloomington, IN 47401	39.110000	-86.520000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish the standing timber for crappie with jigs in spring\nTarget bass along the shoreline with spinnerbaits\nThe Cutright area has the best walleye fishing\nShore fish at Paynetown SRA for easy family access	\N	\N	active	2026-09-23 06:27:43.001682+00	2026-09-23 06:27:43.001682+00	183
Altamaha River	altamaha-river-24	Georgia's largest free-flowing river with incredible biodiversity.	Georgia	Jesup	\N	USA	Altamaha River, Jesup, GA 31545	31.610000	-81.880000	river	\N	t	f	t	Free (License Required)	Spring	Fish oxbow lakes for trophy largemouth\nUse crickets for redbreast sunfish\nTarget sandbars for catfish at night	\N	\N	active	2026-09-23 06:23:05.903288+00	2026-09-23 06:23:05.903288+00	24
Patoka Lake	patoka-lake-31	Indiana's second-largest reservoir with excellent multi-species fishing.	Indiana	Birdseye	\N	USA	Patoka Lake, Birdseye, IN 47513	38.410000	-86.690000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish brush piles for crappie in spring\nTarget rocky points for walleye at dawn\nUse topwater lures for bass in summer evenings	\N	\N	active	2026-09-23 06:23:12.059913+00	2026-09-23 06:23:12.059913+00	31
Sam Rayburn Reservoir	sam-rayburn-reservoir-172	The largest lake entirely within Texas at 114,500 acres. Known as a bass fishing paradise with massive hydrilla beds that produce trophy largemouth year after year.	Texas	Jasper	\N	USA	Sam Rayburn Reservoir, Jasper, TX 75951	31.060000	-94.100000	lake	\N	t	f	t	Free (License Required)	Spring	Fish the hydrilla edges with Texas-rigged worms for bass\nTarget crappie in standing timber with minnows in spring\nThe Angelina River arm has the best bass habitat\nUse Carolina rigs on main lake humps in summer	\N	\N	active	2026-09-23 06:27:35.130326+00	2026-09-23 06:27:35.130326+00	172
Rathbun Lake	rathbun-lake-184	Iowa's top walleye lake and a hidden gem for muskie fishing. The 11,000-acre reservoir offers excellent fishing with a resort lodge and multiple campgrounds for families.	Iowa	Centerville	\N	USA	Rathbun Lake, Centerville, IA 52544	40.820000	-92.870000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Troll for walleye with crawler harnesses along the dam\nTarget muskie in the upper arms with large jerkbaits\nFish brush piles for crappie near the marina\nThe Chariton River arm has the best catfish action	\N	\N	active	2026-09-23 06:27:43.639899+00	2026-09-23 06:27:43.639899+00	184
Lake D'Arbonne	lake-d-arbonne-180	A beautiful cypress-studded lake in northern Louisiana with outstanding crappie and bass fishing. The state park offers camping, cabins, and a fishing pier perfect for families.	Louisiana	Farmerville	\N	USA	Lake D'Arbonne State Park, Farmerville, LA 71241	32.780000	-92.120000	lake	\N	t	f	t	Free (License Required)	Spring	Fish the cypress trees for crappie with jigs and minnows\nTarget bass in the flooded timber with spinnerbaits\nThe state park pier is great for kids fishing for bluegill\nUse chicken liver for catfish near the dam at night	\N	\N	active	2026-09-23 06:27:40.990841+00	2026-09-23 06:27:40.990841+00	180
St. Johns River	st-johns-river-22	One of few north-flowing rivers in the US with excellent bass and shad fishing.	Florida	Palatka	\N	USA	St. Johns River, Palatka, FL 32177	29.650000	-81.650000	river	\N	t	f	t	Free (License Required)	Spring	Fish the shad run in February for incredible action\nTarget bass in the lily pads with topwater\nFish shell beds for crappie with jigs	\N	\N	active	2026-09-23 06:23:04.273603+00	2026-09-23 06:23:04.273603+00	22
Jordan Lake	jordan-lake-173	The Triangle area's top fishing lake just minutes from Raleigh, Durham, and Chapel Hill. Multiple recreation areas with beaches, campgrounds, and excellent family fishing access.	North Carolina	Apex	\N	USA	Jordan Lake, Apex, NC 27523	35.720000	-79.060000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the standing timber for crappie in spring with jigs\nTarget stripers near the dam with live shad or umbrella rigs\nThe Haw River arm has the best bass fishing\nShore fish at Seaforth Beach Recreation Area for easy family access	\N	\N	active	2026-09-23 06:27:35.78856+00	2026-09-23 06:27:35.78856+00	173
Lake Lanier	lake-lanier-23	Metro Atlanta's premier fishing lake with excellent spotted bass populations.	Georgia	Buford	\N	USA	Lake Lanier, Buford, GA 30518	34.160000	-84.070000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish deep bluffs for spotted bass with jerkbaits\nTarget stripers with live herring near the dam\nFish docks for largemouth in summer	\N	\N	active	2026-09-23 06:23:05.257666+00	2026-09-23 06:23:05.257666+00	23
Lake Allatoona	lake-allatoona-175	Metro Atlanta's most accessible fishing lake with 12,010 acres just 30 minutes from downtown. Multiple Corps of Engineers parks provide free boat ramps and picnic areas.	Georgia	Cartersville	\N	USA	Lake Allatoona, Cartersville, GA 30121	34.160000	-84.690000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the red clay points for spotted bass with crankbaits\nTarget stripers near the dam with live herring in summer\nThe Etowah River arm has the best crappie in spring\nShore fish at Red Top Mountain State Park for family access	\N	\N	active	2026-09-23 06:27:37.051982+00	2026-09-23 06:27:37.051982+00	175
Lake Coeur d'Alene	lake-coeur-d-alene-28	Stunning mountain lake with diverse fishing and beautiful scenery.	Idaho	Coeur d'Alene	\N	USA	Lake Coeur d'Alene, Coeur d'Alene, ID 83814	47.680000	-116.780000	lake	\N	t	f	t	Free (License Required)	Summer	Troll for chinook with downriggers in summer\nFish the bays for largemouth bass\nTarget northern pike in the Chain Lakes area	\N	\N	active	2026-09-23 06:23:09.772485+00	2026-09-23 06:23:09.772485+00	28
Snake River	snake-river-27	Premier fly fishing destination with stunning canyon scenery and trophy trout.	Idaho	Twin Falls	\N	USA	Snake River, Twin Falls, ID 83301	42.560000	-114.460000	river	\N	t	f	t	Free (License Required)	Summer & Fall	Float the South Fork for cutthroat trout\nFish the Henry's Fork for technical dry fly fishing\nTarget sturgeon in Hells Canyon with heavy tackle	\N	\N	active	2026-09-23 06:23:09.127283+00	2026-09-23 06:23:09.127283+00	27
Spirit Lake	spirit-lake-33	Iowa's largest natural lake with exceptional walleye and perch fishing.	Iowa	Spirit Lake	\N	USA	Spirit Lake, Spirit Lake, IA 51360	43.420000	-95.100000	lake	\N	t	f	t	Free (License Required)	Summer & Winter	Troll crankbaits for walleye in summer\nIce fish for perch with wax worms\nTarget muskie with large bucktails in fall	\N	\N	active	2026-09-23 06:23:13.73032+00	2026-09-23 06:23:13.73032+00	33
Coosa River - Lay Lake	coosa-river-lay-lake-176	Part of the legendary Coosa River chain of lakes in central Alabama. Lay Lake offers excellent spotted bass fishing and is a popular tournament destination.	Alabama	Columbiana	\N	USA	Lay Lake, Columbiana, AL 35051	33.200000	-86.550000	river	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the river channel ledges for spotted bass with crankbaits\nTarget crappie in brush piles near the bridges\nThe Coosa River section above the lake has excellent wade fishing\nUse topwater in the backs of creeks for largemouth at dawn	\N	\N	active	2026-09-23 06:27:37.722465+00	2026-09-23 06:27:37.722465+00	176
Everglades National Park	everglades-national-park-177	America's premier backcountry fishing destination with both freshwater and saltwater species in a unique mangrove wilderness. Snook and tarpon fishing here is world-class.	Florida	Everglades National Park	\N	USA	Flamingo, Everglades National Park, FL 33034	25.140000	-80.910000	ocean	\N	t	f	t	National Park Fee ($30/vehicle)	Winter & Spring	Fish the mangrove shorelines for snook with live pilchards\nTarget tarpon in the backcountry channels in spring\nThe freshwater canals hold trophy largemouth bass\nHire a guide for your first trip - navigation is complex	\N	\N	active	2026-09-23 06:27:38.389123+00	2026-09-23 06:27:38.389123+00	177
Lake Michigan - Chicago	lake-michigan-chicago-29	World-class Great Lakes fishing accessible from downtown Chicago.	Illinois	Chicago	\N	USA	Chicago Lakefront, Chicago, IL 60611	41.878100	-87.629800	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for salmon offshore in spring and fall\nFish the harbors for perch in summer\nTarget steelhead in tributary streams in fall	\N	\N	active	2026-09-23 06:23:10.760969+00	2026-09-23 06:23:10.760969+00	29
Raystown Lake	raystown-lake-179	Pennsylvania's largest lake entirely within the state, set in the Appalachian Mountains. Known for trophy striped bass and excellent multi-species fishing with stunning fall foliage.	Pennsylvania	Huntingdon	\N	USA	Raystown Lake, Huntingdon, PA 16652	40.410000	-78.010000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for stripers with umbrella rigs near the dam\nFish rocky points for smallmouth with crawfish patterns\nTarget walleye at night with jigs near the creek mouths\nThe Entriken area has the best crappie fishing in spring	\N	\N	active	2026-09-23 06:27:40.360258+00	2026-09-23 06:27:40.360258+00	179
Flint Hills Pay Lake	flint-hills-pay-lake-36	Family-friendly stocked fishing lake in the heart of the Flint Hills.	Kansas	Emporia	\N	USA	1234 Fishing Rd, Emporia, KS 66801	38.400000	-96.180000	pay-lake	\N	f	t	t	$40/day	Spring & Fall	Use stink bait for channel catfish\nFish PowerBait for stocked rainbow trout\nBest fishing is early morning and late evening	\N	\N	active	2026-09-23 06:23:16.343052+00	2026-09-23 06:23:16.343052+00	36
Kentucky Lake	kentucky-lake-37	One of the largest man-made lakes in the eastern US, crappie fishing capital.	Kentucky	Gilbertsville	\N	USA	Kentucky Lake, Gilbertsville, KY 42044	36.940000	-88.280000	lake	\N	t	f	t	Free (License Required)	Spring	Spider rig for crappie over brush piles\nFish ledges for summer bass with deep cranks\nTarget the dam tailwaters for sauger in winter	\N	\N	active	2026-09-23 06:23:16.998725+00	2026-09-23 06:23:16.998725+00	37
Milford Reservoir	milford-reservoir-35	Kansas' largest lake with outstanding walleye and white bass fishing.	Kansas	Junction City	\N	USA	Milford Reservoir, Junction City, KS 66441	39.070000	-96.900000	lake	\N	t	f	t	Free (License Required)	Spring	Fish the white bass run in spring for non-stop action\nTroll for walleye with bottom bouncers\nTarget stripers near the dam with live shad	\N	\N	active	2026-09-23 06:23:15.380371+00	2026-09-23 06:23:15.380371+00	35
Venice - Mississippi Delta	venice-mississippi-delta-39	World-class inshore and offshore fishing at the mouth of the Mississippi.	Louisiana	Venice	\N	USA	Venice, LA 70091	29.270000	-89.350000	ocean	\N	t	f	t	Free (License Required)	Year-round	Sight fish for redfish in the marsh with gold spoons\nRun offshore for yellowfin tuna at the rigs\nFish live shrimp under corks for speckled trout	\N	\N	active	2026-09-23 06:23:18.341119+00	2026-09-23 06:23:18.341119+00	39
Dale Hollow Lake	dale-hollow-lake-38	Crystal-clear lake holding the world record smallmouth bass (11 lbs 15 oz).	Kentucky	Burkesville	\N	USA	Dale Hollow Lake, Burkesville, KY 42717	36.610000	-85.450000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish rocky points for trophy smallmouth\nTroll deep for walleye near the dam\nTarget muskie with large jerkbaits in fall	\N	\N	active	2026-09-23 06:23:17.700559+00	2026-09-23 06:23:17.700559+00	38
Moosehead Lake	moosehead-lake-41	Maine's largest lake surrounded by wilderness with excellent cold-water fishing.	Maine	Greenville	\N	USA	Moosehead Lake, Greenville, ME 04441	45.540000	-69.660000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll streamers for landlocked salmon after ice-out\nFish deep for lake trout with spoons\nTarget brook trout in tributary streams	\N	\N	active	2026-09-23 06:23:19.648201+00	2026-09-23 06:23:19.648201+00	41
Toledo Bend Reservoir	toledo-bend-reservoir-40	Legendary bass lake on the Texas-Louisiana border producing giants.	Louisiana	Many	\N	USA	Toledo Bend, Many, LA 71449	31.560000	-93.560000	lake	\N	t	f	t	Free (License Required)	Spring	Fish hydrilla edges for bass with Texas rigs\nTarget standing timber for crappie\nUse Carolina rigs on main lake points in summer	\N	\N	active	2026-09-23 06:23:18.984904+00	2026-09-23 06:23:18.984904+00	40
Kennebec River	kennebec-river-42	Historic river with restored Atlantic salmon runs and excellent striper fishing.	Maine	Augusta	\N	USA	Kennebec River, Augusta, ME 04330	44.310000	-69.780000	river	\N	t	f	t	Free (License Required)	Summer	Fish the tidal section for stripers with live eels\nTarget smallmouth in the upper river with crawfish\nFly fish for Atlantic salmon in designated pools	\N	\N	active	2026-09-23 06:23:20.608286+00	2026-09-23 06:23:20.608286+00	42
Chesapeake Bay	chesapeake-bay-43	The largest estuary in the United States with incredible saltwater fishing.	Maryland	Chesapeake Bay	\N	USA	Chesapeake Bay, MD	38.900000	-76.350000	ocean	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for trophy stripers in spring near the Bay Bridge\nChum for bluefish and stripers in fall\nFish the shallows for red drum with cut bait	\N	\N	active	2026-09-23 06:23:21.564815+00	2026-09-23 06:23:21.564815+00	43
Deep Creek Lake	deep-creek-lake-44	Western Maryland's largest lake with excellent walleye and bass fishing.	Maryland	McHenry	\N	USA	Deep Creek Lake, McHenry, MD 21541	39.510000	-79.350000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Jig for walleye along rocky shorelines\nFish docks for largemouth in summer\nIce fish for perch and walleye in winter	\N	\N	active	2026-09-23 06:23:22.496814+00	2026-09-23 06:23:22.496814+00	44
Cape Cod Bay	cape-cod-bay-45	Historic New England fishing waters with abundant stripers and bluefish.	Massachusetts	Provincetown	\N	USA	Cape Cod, Provincetown, MA 02657	42.050000	-70.180000	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Surf cast for stripers at dawn and dusk\nFish the Canal for stripers during tide changes\nBook offshore trips for bluefin tuna in fall	\N	\N	active	2026-09-23 06:23:23.184785+00	2026-09-23 06:23:23.184785+00	45
Quabbin Reservoir	quabbin-reservoir-46	Pristine reservoir with trophy landlocked salmon and lake trout.	Massachusetts	Belchertown	\N	USA	Quabbin Reservoir, Belchertown, MA 01007	42.320000	-72.330000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for salmon with lead core line in spring\nFish deep for lakers with tube jigs\nShore fish for smallmouth at accessible points	\N	\N	active	2026-09-23 06:23:24.80143+00	2026-09-23 06:23:24.80143+00	46
Lake Michigan	lake-michigan-47	One of the Great Lakes with world-class salmon and steelhead fishing.	Michigan	Lake Michigan	\N	USA	Lake Michigan, MI	43.600000	-86.350000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for salmon with downriggers in spring\nFish the Pere Marquette River for steelhead\nTarget perch near piers in summer	\N	\N	active	2026-09-23 06:23:25.500539+00	2026-09-23 06:23:25.500539+00	47
Lake St. Clair	lake-st-clair-49	World-class smallmouth bass fishery with crystal-clear water.	Michigan	Harrison Township	\N	USA	Lake St. Clair, Harrison Township, MI 48045	42.580000	-82.760000	lake	\N	t	f	t	Free (License Required)	Summer	Fish the flats for smallmouth with tube jigs\nTarget muskie with large jerkbaits in fall\nDrift for walleye near the shipping channel	\N	\N	active	2026-09-23 06:23:26.816884+00	2026-09-23 06:23:26.816884+00	49
Au Sable River	au-sable-river-48	Michigan's most famous trout stream with legendary hex hatch fishing.	Michigan	Grayling	\N	USA	Au Sable River, Grayling, MI 49738	44.660000	-84.710000	river	\N	t	f	t	Free (License Required)	Summer	Fish the hex hatch in June for trophy browns\nWade the Holy Waters section for dry fly fishing\nUse small nymphs and streamers in the flies-only water	\N	\N	active	2026-09-23 06:23:26.158332+00	2026-09-23 06:23:26.158332+00	48
Mille Lacs Lake	mille-lacs-lake-50	Minnesota's premier walleye lake with massive open-water structure.	Minnesota	Garrison	\N	USA	Mille Lacs Lake, Garrison, MN 56450	46.200000	-93.600000	lake	\N	t	f	t	Free (License Required)	Summer & Winter	Fish mud flats for walleye with leeches\nTarget rock reefs for smallmouth\nIce fish for walleye with jigging Raps in winter	\N	\N	active	2026-09-23 06:23:27.53516+00	2026-09-23 06:23:27.53516+00	50
Grenada Lake	grenada-lake-181	Mississippi's crappie fishing capital, producing some of the largest crappie in the nation. The flooded timber provides perfect habitat for slabs over 2 lbs.	Mississippi	Grenada	\N	USA	Grenada Lake, Grenada, MS 38901	33.770000	-89.810000	lake	\N	t	f	t	Free (License Required)	Spring	Spider rig for crappie over brush piles with minnows\nFish the standing timber for trophy crappie in March\nTarget white bass at the Yalobusha River inlet in spring\nThe south end has the best bass fishing near the grass	\N	\N	active	2026-09-23 06:27:41.628365+00	2026-09-23 06:27:41.628365+00	181
Lake Erie	lake-erie-75	Walleye capital of the world with excellent perch and steelhead fishing.	Ohio	Cleveland	\N	USA	Lake Erie, Cleveland, OH 44114	41.500000	-81.700000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for walleye with worm harnesses in summer\nFish the reefs for perch in fall\nTarget steelhead in tributaries October-April	\N	\N	active	2026-09-23 06:23:46.316217+00	2026-09-23 06:23:46.316217+00	75
Ross Barnett Reservoir	ross-barnett-reservoir-52	Central Mississippi's top fishing destination with excellent bass and crappie.	Mississippi	Brandon	\N	USA	Ross Barnett Reservoir, Brandon, MS 39042	32.350000	-89.980000	lake	\N	t	f	t	Free (License Required)	Spring	Fish grass edges for bass with spinnerbaits\nTarget brush piles for crappie with minnows\nNight fish for catfish with cut shad	\N	\N	active	2026-09-23 06:23:28.804993+00	2026-09-23 06:23:28.804993+00	52
Lake McConaughy	lake-mcconaughy-58	Nebraska's largest reservoir with sandy beaches and excellent walleye fishing.	Nebraska	Ogallala	\N	USA	Lake McConaughy, Ogallala, NE 69153	41.220000	-101.660000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish the white bass run at the inlet in spring\nTroll for walleye along the dam face\nShore fish for catfish at night with cut shad	\N	\N	active	2026-09-23 06:23:33.447963+00	2026-09-23 06:23:33.447963+00	58
Lake Winnipesaukee	lake-winnipesaukee-62	New Hampshire's largest lake with excellent salmon and bass fishing.	New Hampshire	Laconia	\N	USA	Lake Winnipesaukee, Laconia, NH 03246	43.530000	-71.470000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Troll for salmon with lead core in spring\nFish rocky islands for smallmouth in summer\nIce fish for lake trout in winter	\N	\N	active	2026-09-23 06:23:37.076922+00	2026-09-23 06:23:37.076922+00	62
Lake Fork	lake-fork-91	Texas trophy bass lake producing numerous state records over 13 lbs.	Texas	Quitman	\N	USA	Lake Fork, Quitman, TX 75783	32.880000	-95.730000	lake	\N	t	f	t	Free (License Required)	Spring	Fish timber lines for bass with Carolina rigs\nTarget spawning bass in shallow coves in spring\nUse live shiners for trophy bass	\N	\N	active	2026-09-23 06:23:58.358252+00	2026-09-23 06:23:58.358252+00	91
Stockton Lake	stockton-lake-182	Missouri's walleye capital with crystal-clear Ozark water and excellent multi-species fishing. The 24,900-acre lake also offers outstanding paddlefish snagging below the dam.	Missouri	Stockton	\N	USA	Stockton Lake, Stockton, MO 65785	37.690000	-93.790000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for walleye with bottom bouncers and crawler harnesses\nFish the clear water with finesse techniques for bass\nSnag for paddlefish below the dam in March-April\nThe Big Sac arm has the best crappie fishing	\N	\N	active	2026-09-23 06:27:42.275279+00	2026-09-23 06:27:42.275279+00	182
Lake Sakakawea	lake-sakakawea-73	Massive Missouri River reservoir with world-class walleye fishing.	North Dakota	Garrison	\N	USA	Lake Sakakawea, Garrison, ND 58540	47.650000	-102.500000	lake	\N	t	f	t	Free (License Required)	Summer	Troll bottom bouncers for walleye on the flats\nFish rocky points for smallmouth bass\nTarget pike in shallow bays in spring	\N	\N	active	2026-09-23 06:23:45.001317+00	2026-09-23 06:23:45.001317+00	73
Mississippi Gulf Coast	mississippi-gulf-coast-53	Barrier island fishing with excellent inshore and nearshore opportunities.	Mississippi	Biloxi	\N	USA	Biloxi, MS 39530	30.390000	-88.890000	ocean	\N	t	f	t	Free (License Required)	Fall	Fish the barrier islands for speckled trout\nTarget bull reds in the marshes in fall\nUse live shrimp for flounder near passes	\N	\N	active	2026-09-23 06:23:29.445435+00	2026-09-23 06:23:29.445435+00	53
Finger Lakes	finger-lakes-70	Deep glacial lakes with excellent cold-water fishing and stunning scenery.	New York	Geneva	\N	USA	Seneca Lake, Geneva, NY 14456	42.870000	-76.980000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for lake trout in the deep basins\nFish tributary streams for steelhead in fall\nTarget perch near docks in summer	\N	\N	active	2026-09-23 06:23:43.058194+00	2026-09-23 06:23:43.058194+00	70
Grand Lake O' the Cherokees	grand-lake-o-the-cherokees-77	Northeast Oklahoma's premier lake with excellent bass and paddlefish snagging.	Oklahoma	Grove	\N	USA	Grand Lake, Grove, OK 74344	36.590000	-94.790000	lake	\N	t	f	t	Free (License Required)	Spring	Fish the Grand River arm for bass\nSnag for paddlefish below Pensacola Dam in spring\nTarget crappie in brush piles with jigs	\N	\N	active	2026-09-23 06:23:47.926589+00	2026-09-23 06:23:47.926589+00	77
Tillamook Bay	tillamook-bay-80	Productive Oregon coast bay with excellent salmon and crabbing.	Oregon	Garibaldi	\N	USA	Tillamook Bay, Garibaldi, OR 97118	45.560000	-123.910000	ocean	\N	t	f	t	Free (License Required)	Fall	Troll for chinook in the bay in August\nFish for coho near the jetties in September\nCrab the bay flats on incoming tides	\N	\N	active	2026-09-23 06:23:49.913542+00	2026-09-23 06:23:49.913542+00	80
Narragansett Bay	narragansett-bay-84	New England's largest estuary with year-round fishing opportunities.	Rhode Island	Warwick	\N	USA	Narragansett Bay, Warwick, RI 02886	41.700000	-71.420000	ocean	\N	t	f	t	Free (License Required)	Summer	Fish the Providence River for schoolie stripers\nTarget tautog around bridge pilings\nDrift for scup over sandy bottoms	\N	\N	active	2026-09-23 06:23:53.446318+00	2026-09-23 06:23:53.446318+00	84
Reelfoot Lake	reelfoot-lake-90	Earthquake-formed lake famous for incredible crappie fishing in cypress trees.	Tennessee	Tiptonville	\N	USA	Reelfoot Lake, Tiptonville, TN 38079	36.370000	-89.420000	lake	\N	t	f	t	Free (License Required)	Spring	Fish cypress trees for crappie with jigs and minnows\nTarget bass in lily pads with frogs\nUse crickets for giant bluegill in summer	\N	\N	active	2026-09-23 06:23:57.705708+00	2026-09-23 06:23:57.705708+00	90
San Juan River	san-juan-river-67	Blue-ribbon tailwater with trophy trout averaging 16-20 inches.	New Mexico	Navajo Dam	\N	USA	San Juan River, Navajo Dam, NM 87419	36.810000	-107.620000	river	\N	t	f	t	Free (License Required)	Year-round	Use tiny midges and San Juan worms\nFish the quality water section for best results\nSight fish to rising trout with dry-dropper rigs	\N	\N	active	2026-09-23 06:23:40.780913+00	2026-09-23 06:23:40.780913+00	67
Wheeler Lake	wheeler-lake-2	Tennessee River impoundment known for excellent smallmouth bass and crappie fishing.	Alabama	Decatur	\N	USA	Wheeler Lake, Decatur, AL 35601	34.605900	-87.000000	lake	\N	t	f	t	Free (License Required)	Spring	Target rocky points for smallmouth in spring\nFish brush piles for crappie with minnows\nNight fish for catfish near the dam	\N	\N	active	2026-09-23 06:22:44.341387+00	2026-09-23 06:22:44.341387+00	2
Lake of the Ozarks	lake-of-the-ozarks-54	Popular Midwest lake with over 1,150 miles of shoreline and great bass fishing.	Missouri	Osage Beach	\N	USA	Lake of the Ozarks, Osage Beach, MO 65065	38.130000	-92.660000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish docks for bass with jigs in summer\nTarget brush piles for crappie in spring\nSnag for paddlefish below Truman Dam in spring	\N	\N	active	2026-09-23 06:23:30.447178+00	2026-09-23 06:23:30.447178+00	54
Lake Mead	lake-mead-60	Desert oasis with excellent striped bass fishing in dramatic canyon scenery.	Nevada	Boulder City	\N	USA	Lake Mead National Recreation Area, Boulder City, NV 89005	36.150000	-114.740000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Chase boiling stripers with topwater in spring\nFish coves for largemouth with soft plastics\nTarget catfish near marinas at night	\N	\N	active	2026-09-23 06:23:35.090187+00	2026-09-23 06:23:35.090187+00	60
Charleston Harbor	charleston-harbor-86	Historic port city with incredible inshore fishing in the Lowcountry.	South Carolina	Charleston	\N	USA	Charleston Harbor, Charleston, SC 29401	32.780000	-79.930000	ocean	\N	t	f	t	Free (License Required)	Fall	Sight fish for tailing redfish on the flats\nFish dock pilings for sheepshead with fiddler crabs\nTarget flounder in the creeks with live minnows	\N	\N	active	2026-09-23 06:23:55.11714+00	2026-09-23 06:23:55.11714+00	86
Table Rock Lake	table-rock-lake-55	Clear Ozarks lake with outstanding spotted bass and white bass fishing.	Missouri	Branson	\N	USA	Table Rock Lake, Branson, MO 65616	36.630000	-93.320000	lake	\N	t	f	t	Free (License Required)	Spring	Fish deep bluffs for spotted bass with drop shots\nChase white bass schooling on the surface in fall\nTarget walleye near the dam with jigs	\N	\N	active	2026-09-23 06:23:31.124811+00	2026-09-23 06:23:31.124811+00	55
Yellowstone River	yellowstone-river-56	Pristine fly fishing in America's longest undammed river.	Montana	Livingston	\N	USA	Yellowstone River, Livingston, MT 59047	45.660000	-110.560000	river	\N	t	f	t	Free (License Required)	Summer & Fall	Float the Paradise Valley section for cutthroat\nFish hoppers and attractors in late summer\nTarget brown trout with streamers in fall	\N	\N	active	2026-09-23 06:23:31.833746+00	2026-09-23 06:23:31.833746+00	56
Outer Banks	outer-banks-71	Premier offshore fishing destination on the East Coast with the Gulf Stream nearby.	North Carolina	Nags Head	\N	USA	Outer Banks, Nags Head, NC 27959	35.960000	-75.620000	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Book offshore charters for marlin and tuna\nSurf fish for red drum in fall\nFish the inlets for flounder and speckled trout	\N	\N	active	2026-09-23 06:23:43.682557+00	2026-09-23 06:23:43.682557+00	71
Lake Oahe	lake-oahe-87	One of the largest dams in the US with world-class walleye fishing.	South Dakota	Pierre	\N	USA	Lake Oahe, Pierre, SD 57501	44.370000	-100.390000	lake	\N	t	f	t	Free (License Required)	Summer	Troll for walleye with bottom bouncers and crawlers\nTarget salmon near the dam with spoons\nFish creek arms for northern pike in spring	\N	\N	active	2026-09-23 06:23:55.752962+00	2026-09-23 06:23:55.752962+00	87
Boundary Waters	boundary-waters-51	Pristine wilderness canoe area with over 1,000 lakes and incredible fishing.	Minnesota	Ely	\N	USA	Boundary Waters Canoe Area, Ely, MN 55731	47.900000	-91.830000	lake	\N	f	t	t	Permit Required ($16/day)	Summer	Portage to remote lakes for less pressure\nFish rocky points for walleye at dusk\nTarget lake trout in deep cold lakes	\N	\N	active	2026-09-23 06:23:28.16414+00	2026-09-23 06:23:28.16414+00	51
Connecticut River - NH	connecticut-river-nh-63	Upper Connecticut River with pristine trout fishing in remote wilderness.	New Hampshire	Pittsburg	\N	USA	Connecticut River, Pittsburg, NH 03592	45.000000	-71.350000	river	\N	t	f	t	Free (License Required)	Summer	Fish the Trophy Stretch for large browns\nUse dry flies during summer hatches\nTarget brook trout in small tributaries	\N	\N	active	2026-09-23 06:23:37.772058+00	2026-09-23 06:23:37.772058+00	63
Gulf of Mexico - Texas	gulf-of-mexico-texas-92	Deep sea fishing paradise with trophy game fish and incredible inshore fishing.	Texas	Port Aransas	\N	USA	Port Aransas, TX 78373	27.830000	-97.060000	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Book offshore trips for red snapper in June\nWade fish the flats for redfish with gold spoons\nTarget tarpon in the passes in summer	\N	\N	active	2026-09-23 06:23:59.00047+00	2026-09-23 06:23:59.00047+00	92
Fort Peck Reservoir	fort-peck-reservoir-57	Massive Missouri River reservoir with incredible walleye and pike fishing.	Montana	Glasgow	\N	USA	Fort Peck Reservoir, Glasgow, MT 59230	47.610000	-106.640000	lake	\N	t	f	t	Free (License Required)	Summer	Troll for walleye with bottom bouncers\nTarget pike in shallow bays in spring\nFish deep for lake trout near the dam	\N	\N	active	2026-09-23 06:23:32.796545+00	2026-09-23 06:23:32.796545+00	57
Calamus Reservoir	calamus-reservoir-59	Sandhills gem with outstanding walleye and northern pike fishing.	Nebraska	Burwell	\N	USA	Calamus Reservoir, Burwell, NE 68823	41.830000	-99.150000	lake	\N	t	f	t	Free (License Required)	Summer	Fish rocky points for walleye at dawn\nTarget weed beds for northern pike\nUse minnows under bobbers for crappie	\N	\N	active	2026-09-23 06:23:34.437182+00	2026-09-23 06:23:34.437182+00	59
Montauk Point	montauk-point-69	Legendary surf fishing destination at the tip of Long Island.	New York	Montauk	\N	USA	Montauk Point, Montauk, NY 11954	41.070000	-71.860000	ocean	\N	t	f	t	Free (License Required)	Fall	Surf cast for stripers during the fall blitz\nFish the rips for bluefish with metal lures\nBook offshore trips for tuna in summer	\N	\N	active	2026-09-23 06:23:42.073473+00	2026-09-23 06:23:42.073473+00	69
Lake Norman	lake-norman-72	Charlotte's backyard lake with excellent striped bass and largemouth fishing.	North Carolina	Mooresville	\N	USA	Lake Norman, Mooresville, NC 28117	35.590000	-80.950000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish docks for largemouth with jigs\nTarget stripers with live herring near the dam\nFish brush piles for crappie in spring	\N	\N	active	2026-09-23 06:23:44.359724+00	2026-09-23 06:23:44.359724+00	72
Devils Lake	devils-lake-74	North Dakota's largest natural lake with incredible walleye and perch fishing.	North Dakota	Devils Lake	\N	USA	Devils Lake, Devils Lake, ND 58301	48.110000	-98.860000	lake	\N	t	f	t	Free (License Required)	Summer & Winter	Jig for walleye along the rocky reefs\nIce fish for perch with minnows\nTarget pike in the coulees in spring	\N	\N	active	2026-09-23 06:23:45.664801+00	2026-09-23 06:23:45.664801+00	74
Salmon River	salmon-river-68	East Coast salmon and steelhead mecca with massive fall runs.	New York	Pulaski	\N	USA	Salmon River, Pulaski, NY 13142	43.560000	-76.170000	river	\N	t	f	t	Free (License Required)	Fall & Winter	Drift eggs for chinook in October\nSwing flies for steelhead in winter\nFish egg patterns below spawning salmon	\N	\N	active	2026-09-23 06:23:41.436519+00	2026-09-23 06:23:41.436519+00	68
Lake Erie - PA	lake-erie-pa-81	Pennsylvania's Great Lake access with incredible steelhead tributaries.	Pennsylvania	Erie	\N	USA	Presque Isle Bay, Erie, PA 16505	42.120000	-80.090000	lake	\N	t	f	t	Free (License Required)	Fall & Winter	Fish Elk Creek for steelhead October-March\nTarget walleye near Presque Isle in spring\nFish the bay for bass and perch in summer	\N	\N	active	2026-09-23 06:23:50.858042+00	2026-09-23 06:23:50.858042+00	81
Delaware River	delaware-river-82	Excellent shad runs and year-round bass fishing in a historic river.	Pennsylvania	Philadelphia	\N	USA	Delaware River, Philadelphia, PA 19106	39.952600	-75.165200	river	\N	t	f	t	Free (License Required)	Spring	Fish the shad run in April-May with dart jigs\nTarget smallmouth in the upper river with crawfish\nFish the Delaware Water Gap for trophy trout	\N	\N	active	2026-09-23 06:23:51.509647+00	2026-09-23 06:23:51.509647+00	82
Sebago Lake	sebago-lake-156	Maine's second-largest lake and the birthplace of landlocked salmon fishing in America. Crystal-clear water and stunning scenery make it a premier New England fishing destination.	Maine	Windham	\N	USA	Sebago Lake, Windham, ME 04062	43.800000	-70.550000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for landlocked salmon with streamer flies after ice-out\nFish the Crooked River inlet for salmon and trout in spring\nTarget smallmouth on rocky islands with tube jigs in summer\nThe Songo River area is excellent for bass and perch	\N	\N	active	2026-09-23 06:24:48.014413+00	2026-09-23 06:24:48.014413+00	156
Deschutes River	deschutes-river-79	Oregon's premier fly fishing river with wild redsides and summer steelhead.	Oregon	Maupin	\N	USA	Deschutes River, Maupin, OR 97037	45.170000	-121.180000	river	\N	t	f	t	Free (License Required)	Summer & Fall	Fish the salmonfly hatch in late May\nSwing flies for summer steelhead July-October\nUse dry flies for redsides in the canyon	\N	\N	active	2026-09-23 06:23:49.258549+00	2026-09-23 06:23:49.258549+00	79
Lake Sharpe	lake-sharpe-88	Missouri River reservoir with consistent walleye fishing and scenic bluffs.	South Dakota	Chamberlain	\N	USA	Lake Sharpe, Chamberlain, SD 57325	43.810000	-99.320000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Fish the flats for walleye with jigs and minnows\nTarget catfish below Big Bend Dam\nFish rocky points for smallmouth	\N	\N	active	2026-09-23 06:23:56.408556+00	2026-09-23 06:23:56.408556+00	88
Ohio River	ohio-river-76	Major river system with excellent sauger and catfish fishing below dams.	Ohio	Cincinnati	\N	USA	Ohio River, Cincinnati, OH 45202	39.100000	-84.510000	river	\N	t	f	t	Free (License Required)	Fall & Winter	Fish dam tailwaters for sauger with jigs\nTarget flathead catfish with live bluegill\nFish backwater areas for largemouth bass	\N	\N	active	2026-09-23 06:23:46.956703+00	2026-09-23 06:23:46.956703+00	76
Pyramid Lake	pyramid-lake-61	Ancient desert lake with trophy Lahontan cutthroat trout over 20 lbs.	Nevada	Sutcliffe	\N	USA	Pyramid Lake, Sutcliffe, NV 89510	40.000000	-119.550000	lake	\N	f	t	t	Tribal Permit Required ($12/day)	Winter & Spring	Ladder fish from shore in winter for trophy cutthroat\nUse woolly buggers and streamers\nFish the Nets area for best access	\N	\N	active	2026-09-23 06:23:35.765563+00	2026-09-23 06:23:35.765563+00	61
Barnegat Bay	barnegat-bay-64	Jersey Shore's premier bay fishing with excellent striper and fluke action.	New Jersey	Barnegat Light	\N	USA	Barnegat Bay, Barnegat Light, NJ 08006	39.760000	-74.110000	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Drift for fluke with bucktails and Gulp\nFish the inlet for stripers on the outgoing tide\nTarget weakfish with soft plastics at night	\N	\N	active	2026-09-23 06:23:38.423434+00	2026-09-23 06:23:38.423434+00	64
Elephant Butte Lake	elephant-butte-lake-66	New Mexico's largest lake with excellent warm-water fishing in the desert.	New Mexico	Truth or Consequences	\N	USA	Elephant Butte Lake, Truth or Consequences, NM 87901	33.150000	-107.250000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish rocky points for bass in spring\nTarget stripers with live shad near the dam\nNight fish for walleye with jigs and minnows	\N	\N	active	2026-09-23 06:23:40.127509+00	2026-09-23 06:23:40.127509+00	66
Round Valley Reservoir	round-valley-reservoir-65	Deep, clear reservoir with trophy lake trout and brown trout.	New Jersey	Lebanon	\N	USA	Round Valley Reservoir, Lebanon, NJ 08833	40.640000	-74.840000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll deep for lake trout with spoons\nFish rocky points for smallmouth\nShore fish for trout after spring stocking	\N	\N	active	2026-09-23 06:23:39.403243+00	2026-09-23 06:23:39.403243+00	65
Broken Bow Lake	broken-bow-lake-78	Clear mountain lake with trophy smallmouth and trout in the tailwater below.	Oklahoma	Broken Bow	\N	USA	Broken Bow Lake, Broken Bow, OK 74728	34.170000	-94.720000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish rocky bluffs for smallmouth with jerkbaits\nTarget brown trout in the tailwater with flies\nFish deep for walleye near the dam	\N	\N	active	2026-09-23 06:23:48.572238+00	2026-09-23 06:23:48.572238+00	78
Block Island	block-island-83	Island fishing paradise with incredible striper fishing and diverse species.	Rhode Island	New Shoreham	\N	USA	Block Island, New Shoreham, RI 02807	41.170000	-71.580000	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Fish the Southwest Ledge for stripers\nDrift for fluke around the island\nTarget tautog on rocky structure with green crabs	\N	\N	active	2026-09-23 06:23:52.151492+00	2026-09-23 06:23:52.151492+00	83
Lake Murray	lake-murray-85	Columbia's premier lake with excellent bass and striper fishing.	South Carolina	Irmo	\N	USA	Lake Murray, Irmo, SC 29063	34.070000	-81.210000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish rocky points for bass in spring\nTarget stripers with live herring near the dam\nFish brush piles for crappie with minnows	\N	\N	active	2026-09-23 06:23:54.465774+00	2026-09-23 06:23:54.465774+00	85
Yellowstone Lake	yellowstone-lake-107	High-altitude lake in Yellowstone with native cutthroat trout conservation.	Wyoming	Yellowstone National Park	\N	USA	Yellowstone Lake, Yellowstone National Park, WY 82190	44.560000	-110.350000	lake	\N	f	t	t	National Park Fee ($35/vehicle)	Summer	Fish the outlet for cutthroat in June\nTarget cutthroat along the shoreline with flies\nLake trout must be killed - help conservation efforts	\N	\N	active	2026-09-23 06:24:10.28997+00	2026-09-23 06:24:10.28997+00	107
Falcon Lake	falcon-lake-93	Border lake famous for giant largemouth bass in warm South Texas waters.	Texas	Zapata	\N	USA	Falcon Lake, Zapata, TX 78076	26.910000	-99.140000	lake	\N	t	f	t	Free (License Required)	Winter & Spring	Fish brush piles for bass with jigs\nTarget bass in flooded timber with crankbaits\nBest fishing is December through March	\N	\N	active	2026-09-23 06:23:59.97418+00	2026-09-23 06:23:59.97418+00	93
Lake Champlain	lake-champlain-96	Historic lake with diverse cold and warm water species and stunning views.	Vermont	Burlington	\N	USA	Lake Champlain, Burlington, VT 05401	44.475900	-73.212100	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Troll for salmon near the Inland Sea in spring\nFish rocky shoals for smallmouth in summer\nTarget pike in Missisquoi Bay with spinnerbaits	\N	\N	active	2026-09-23 06:24:02.102217+00	2026-09-23 06:24:02.102217+00	96
Lake Powell - Utah	lake-powell-utah-94	Red-rock reservoir paradise with incredible striper fishing in canyon country.	Utah	Bullfrog	\N	USA	Lake Powell, Bullfrog, UT 84533	37.520000	-110.410000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Find boiling stripers with electronics in spring\nFish canyon walls for smallmouth with drop shots\nTarget walleye at night near the dam	\N	\N	active	2026-09-23 06:24:00.679136+00	2026-09-23 06:24:00.679136+00	94
Green River	green-river-95	World-class tailwater below Flaming Gorge Dam with trophy trout.	Utah	Dutch John	\N	USA	Green River, Dutch John, UT 84023	40.910000	-109.420000	river	\N	t	f	t	Free (License Required)	Year-round	Fish cicada patterns in June for explosive strikes\nUse small midges and scuds year-round\nFloat the A Section for best access	\N	\N	active	2026-09-23 06:24:01.331347+00	2026-09-23 06:24:01.331347+00	95
James River	james-river-98	Urban river with incredible smallmouth fishing through downtown Richmond.	Virginia	Richmond	\N	USA	James River, Richmond, VA 23219	37.540700	-77.436000	river	\N	t	f	t	Free (License Required)	Spring & Summer	Wade fish for smallmouth with crawfish patterns\nTarget shad runs in spring below the falls\nFish the tidal section for stripers	\N	\N	active	2026-09-23 06:24:03.926273+00	2026-09-23 06:24:03.926273+00	98
Battenkill River	battenkill-river-97	Classic New England trout stream with wild brown trout in pastoral setting.	Vermont	Manchester	\N	USA	Battenkill River, Manchester, VT 05254	43.160000	-73.070000	river	\N	t	f	t	Free (License Required)	Spring & Summer	Fish early morning and evening for wary browns\nUse small dry flies and light tippet\nTarget brook trout in the upper tributaries	\N	\N	active	2026-09-23 06:24:03.18856+00	2026-09-23 06:24:03.18856+00	97
Summersville Lake	summersville-lake-103	Crystal-clear mountain lake with exceptional smallmouth bass fishing.	West Virginia	Summersville	\N	USA	Summersville Lake, Summersville, WV 26651	38.230000	-80.850000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish rocky banks for smallmouth with crawfish\nTarget walleye near the dam at night\nUse finesse tactics in the ultra-clear water	\N	\N	active	2026-09-23 06:24:07.665105+00	2026-09-23 06:24:07.665105+00	103
Smith Mountain Lake	smith-mountain-lake-99	Virginia's most popular lake with excellent striper and muskie fishing.	Virginia	Moneta	\N	USA	Smith Mountain Lake, Moneta, VA 24121	37.040000	-79.520000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish live bait for stripers near the dam\nTarget muskie with large swimbaits in fall\nFish docks for largemouth in summer	\N	\N	active	2026-09-23 06:24:04.638471+00	2026-09-23 06:24:04.638471+00	99
Puget Sound	puget-sound-100	Pacific Northwest saltwater fishing at its finest with salmon and bottomfish.	Washington	Seattle	\N	USA	Puget Sound, Seattle, WA 98101	47.606200	-122.332100	ocean	\N	t	f	t	Free (License Required)	Summer & Fall	Mooch for chinook with cut-plug herring\nJig for lingcod on rocky structure\nCrab the shallow bays on incoming tides	\N	\N	active	2026-09-23 06:24:05.317658+00	2026-09-23 06:24:05.317658+00	100
Columbia River	columbia-river-101	Mighty Pacific Northwest river with legendary salmon and sturgeon runs.	Washington	Astoria	\N	USA	Columbia River, Astoria, OR-WA	46.190000	-123.830000	river	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for spring chinook with herring\nFish below Bonneville Dam for sturgeon\nTarget walleye near the John Day Dam	\N	\N	active	2026-09-23 06:24:06.030307+00	2026-09-23 06:24:06.030307+00	101
Lake Winnebago	lake-winnebago-104	Wisconsin's largest inland lake famous for walleye and sturgeon spearing.	Wisconsin	Oshkosh	\N	USA	Lake Winnebago, Oshkosh, WI 54901	44.020000	-88.540000	lake	\N	t	f	t	Free (License Required)	Spring & Winter	Fish the Wolf River for walleye during the spring run\nSpear sturgeon through the ice in February\nTarget white bass at the Fox River mouth in spring	\N	\N	active	2026-09-23 06:24:08.318448+00	2026-09-23 06:24:08.318448+00	104
Santee Cooper Lakes	santee-cooper-lakes-108	Twin lakes famous for trophy catfish and excellent bass fishing.	South Carolina	Santee	\N	USA	Lake Marion, Santee, SC 29142	33.520000	-80.420000	lake	\N	t	f	t	Free (License Required)	Spring	Fish the diversion canal for stripers\nTarget trophy blue catfish with cut shad\nFish cypress trees for crappie in spring	\N	\N	active	2026-09-23 06:24:10.928102+00	2026-09-23 06:24:10.928102+00	108
Chippewa Flowage	chippewa-flowage-105	Home of the former world record muskie, a legendary Northwoods fishery.	Wisconsin	Hayward	\N	USA	Chippewa Flowage, Hayward, WI 54843	46.010000	-91.340000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Cast large bucktails for muskie in fall\nFish weed edges for walleye with jigs\nTarget crappie in the flowage bays in spring	\N	\N	active	2026-09-23 06:24:08.94567+00	2026-09-23 06:24:08.94567+00	105
North Platte River	north-platte-river-106	Blue-ribbon trout water flowing through Wyoming's high plains.	Wyoming	Casper	\N	USA	North Platte River, Casper, WY 82601	42.870000	-106.310000	river	\N	t	f	t	Free (License Required)	Summer & Fall	Float the Miracle Mile for trophy trout\nFish below Alcova Dam for large browns\nUse PMD and caddis patterns in summer	\N	\N	active	2026-09-23 06:24:09.635691+00	2026-09-23 06:24:09.635691+00	106
Apalachicola River	apalachicola-river-110	Wild Florida river with diverse fishing and Gulf sturgeon populations.	Florida	Blountstown	\N	USA	Apalachicola River, Blountstown, FL 32424	30.440000	-85.050000	river	\N	t	f	t	Free (License Required)	Spring	Fish oxbow lakes for trophy bass\nTarget catfish in deep holes with cut bait\nFish the river mouth for stripers in winter	\N	\N	active	2026-09-23 06:24:12.595972+00	2026-09-23 06:24:12.595972+00	110
Flaming Gorge Reservoir	flaming-gorge-reservoir-109	Stunning red-rock reservoir with trophy lake trout and kokanee salmon.	Wyoming	Green River	\N	USA	Flaming Gorge, Green River, WY 82935	41.150000	-109.550000	lake	\N	t	f	t	Free (License Required)	Summer	Troll deep for lake trout with large spoons\nFish for kokanee with dodger/fly combos\nTarget smallmouth in the Lucerne area	\N	\N	active	2026-09-23 06:24:11.559432+00	2026-09-23 06:24:11.559432+00	109
Rainy Lake	rainy-lake-111	Border water wilderness lake with outstanding walleye and pike fishing.	Minnesota	International Falls	\N	USA	Rainy Lake, International Falls, MN 56649	48.660000	-93.360000	lake	\N	t	f	t	Free (License Required)	Summer	Fish the islands for walleye with jigs and minnows\nTarget pike in shallow bays with spinnerbaits\nFish deep rock piles for smallmouth	\N	\N	active	2026-09-23 06:24:13.255307+00	2026-09-23 06:24:13.255307+00	111
Tempe Town Lake	tempe-town-lake-133	A 220-acre urban lake in the heart of the Phoenix metro area, stocked with rainbow trout in winter and catfish year-round. The paved paths and easy access make it ideal for families.	Arizona	Tempe	\N	USA	Tempe Town Lake, Tempe, AZ 85281	33.430000	-111.930000	lake	\N	t	f	t	Free (License Required)	Winter & Spring	Fish for stocked rainbow trout November through March\nTarget catfish near the dam at night with stink bait\nUse PowerBait for trout from the north shore\nEarly morning fishing avoids the desert heat and crowds	\N	\N	active	2026-09-23 06:24:29.133844+00	2026-09-23 06:24:29.133844+00	133
Georgia Bass Club Lake	georgia-bass-club-lake-123	Exclusive bass fishing club with trophy-managed waters and catch records.	Georgia	Atlanta	\N	USA	789 Members Only Dr, Atlanta, GA 30301	33.749000	-84.388000	private	\N	f	t	t	$200/day (Members Only)	Spring	Fish the grass lines for trophy largemouth\nTarget spotted bass on deep structure\nUse live shiners for the biggest bass	\N	\N	active	2026-09-23 06:24:20.972454+00	2026-09-23 06:24:20.972454+00	123
Percy Priest Lake	percy-priest-lake-139	Nashville's backyard lake just 10 miles from downtown, offering 14,200 acres of excellent multi-species fishing. Multiple free public access points and boat ramps make it accessible for all.	Tennessee	Nashville	\N	USA	J. Percy Priest Lake, Nashville, TN 37214	36.110000	-86.620000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the rocky bluffs for smallmouth with tube jigs\nTarget crappie in brush piles near the marinas in spring\nStripers school near the dam - use live shad or umbrella rigs\nThe Stones River arm has the best bass fishing	\N	\N	active	2026-09-23 06:24:34.019523+00	2026-09-23 06:24:34.019523+00	139
Chattooga River	chattooga-river-112	Wild and scenic river on the GA-SC border with excellent mountain trout.	Georgia	Clayton	\N	USA	Chattooga River, Clayton, GA 30525	34.880000	-83.380000	river	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the delayed harvest section for best trout\nUse terrestrial patterns in summer\nTarget wild brook trout in headwater streams	\N	\N	active	2026-09-23 06:24:13.923107+00	2026-09-23 06:24:13.923107+00	112
Kentucky Dam	kentucky-dam-118	Gateway to Kentucky Lake with excellent crappie and sauger in the tailwaters.	Kentucky	Gilbertsville	\N	USA	Kentucky Dam, Gilbertsville, KY 42044	36.990000	-88.270000	dam	\N	t	f	t	Free (License Required)	Spring & Winter	Fish the tailwaters for sauger with jigs in winter\nTarget crappie in the discharge area\nUse cut shad for catfish below the dam	\N	\N	active	2026-09-23 06:24:17.78498+00	2026-09-23 06:24:17.78498+00	118
Hueston Woods State Park Lake	hueston-woods-state-park-lake-146	Ohio's top family fishing destination with a 625-acre lake, nature center, beach, and lodge. The park hosts free kids' fishing clinics and has multiple accessible fishing piers.	Ohio	College Corner	\N	USA	Hueston Woods State Park, College Corner, OH 45003	39.570000	-84.750000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish from the accessible pier near the beach for panfish\nAttend the free kids' fishing clinics in June\nUse worms and bobbers for guaranteed bluegill catches\nRent a boat from the marina to access deeper crappie spots	\N	\N	active	2026-09-23 06:24:39.164911+00	2026-09-23 06:24:39.164911+00	146
Scottsdale Ranch Park Lake	scottsdale-ranch-park-lake-149	A popular urban fishing lake in Scottsdale stocked with trout in winter by AZGFD. The park features a playground, walking paths, and easy bank access ideal for families.	Arizona	Scottsdale	\N	USA	Scottsdale Ranch Park, Scottsdale, AZ 85258	33.570000	-111.850000	lake	\N	t	f	t	Free (License Required)	Winter & Spring	Fish for stocked trout December through March with PowerBait\nTarget catfish in summer evenings with hot dogs or chicken liver\nUse worms under a bobber for bluegill near the playground\nThe south shore has the best shade for comfortable fishing	\N	\N	active	2026-09-23 06:24:41.700335+00	2026-09-23 06:24:41.700335+00	149
East Twin Lake	east-twin-lake-150	One of Connecticut's deepest natural lakes in the scenic Litchfield Hills. The cold, clear water supports both warm and cold-water species with excellent trout fishing.	Connecticut	Salisbury	\N	USA	East Twin Lake, Salisbury, CT 06068	41.960000	-73.450000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for trout in the deep basin with lead core line\nFish rocky points for smallmouth with tube jigs\nTarget pike in the weed beds with large spinnerbaits\nIce fishing for perch and trout is excellent in winter	\N	\N	active	2026-09-23 06:24:42.396207+00	2026-09-23 06:24:42.396207+00	150
Santee Lakes	santee-lakes-136	San Diego's premier family fishing destination with 7 lakes, playgrounds, and camping. Lakes are heavily stocked with trout in winter and catfish in summer, making catches almost guaranteed for kids.	California	Santee	\N	USA	Santee Lakes Recreation Preserve, Santee, CA 92071	32.840000	-116.970000	lake	\N	f	t	t	$8-10/day (Fishing Fee)	Year-round	Lake 5 is the best for kids with easy bank access and stocked fish\nUse PowerBait for trout in winter months\nFish chicken liver for catfish in summer evenings\nAttend the kids' fishing derbies held throughout the year	\N	\N	active	2026-09-23 06:24:31.726956+00	2026-09-23 06:24:31.726956+00	136
Private Trout Stream	private-trout-stream-122	Private spring creek with trophy wild trout in a stunning mountain valley.	Colorado	Vail	\N	USA	567 Exclusive Waters Rd, Vail, CO 81657	39.640000	-106.370000	private	\N	f	t	t	$300/day	Summer	Sight fish to rising trout with dry flies\nUse 6X tippet minimum for wary fish\nFish the evening hatch for best dry fly action	\N	\N	active	2026-09-23 06:24:20.325435+00	2026-09-23 06:24:20.325435+00	122
Lake Texoma	lake-texoma-113	Red River reservoir famous for naturally reproducing striped bass.	Oklahoma	Kingston	\N	USA	Lake Texoma, Kingston, OK 73439	33.980000	-96.780000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the striper boils with topwater in fall\nTarget bass along rocky points in spring\nUse live shad for trophy stripers	\N	\N	active	2026-09-23 06:24:14.567545+00	2026-09-23 06:24:14.567545+00	113
Beaverkill River	beaverkill-river-114	Birthplace of American fly fishing with historic pools and wild trout.	New York	Roscoe	\N	USA	Beaverkill River, Roscoe, NY 12776	41.960000	-74.840000	river	\N	t	f	t	Free (License Required)	Spring & Summer	Fish the Hendrickson hatch in April\nTarget the Junction Pool in Roscoe\nUse small dry flies and light tippet for wary trout	\N	\N	active	2026-09-23 06:24:15.218864+00	2026-09-23 06:24:15.218864+00	114
Table Rock Dam	table-rock-dam-119	Popular Ozarks destination with trophy trout in the cold tailwaters.	Missouri	Branson	\N	USA	Table Rock Dam, Branson, MO 65616	36.590000	-93.310000	dam	\N	t	f	t	Free (License Required)	Year-round	Fish scuds and sowbugs in the tailwater\nTarget brown trout with streamers at dusk\nCheck generation schedules for wade fishing	\N	\N	active	2026-09-23 06:24:18.435076+00	2026-09-23 06:24:18.435076+00	119
Lake Accotink	lake-accotink-148	A beloved family fishing spot in suburban Northern Virginia with a playground, carousel, boat rentals, and easy shoreline access. The 55-acre lake is perfect for young anglers.	Virginia	Springfield	\N	USA	Lake Accotink Park, Springfield, VA 22150	38.790000	-77.230000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish from the dam area for the deepest water and biggest catfish\nUse worms under a bobber near the playground for bluegill\nRent a pedal boat to combine fun with fishing\nThe creek inlet area holds bass and crappie in spring	\N	\N	active	2026-09-23 06:24:41.010591+00	2026-09-23 06:24:41.010591+00	148
Sheldon Lake State Park	sheldon-lake-state-park-132	Houston's best family fishing destination with a dedicated kids' fishing pond, nature center, and easy shoreline access. The park hosts regular family fishing clinics and provides loaner gear.	Texas	Houston	\N	USA	Sheldon Lake State Park, Houston, TX 77044	29.870000	-95.150000	lake	\N	f	t	t	Free (No License Required for Kids Under 17)	Spring & Summer	Start kids at the John Jacob Observation Deck pond for easy catches\nUse worms under bobbers for guaranteed bluegill and sunfish\nThe main lake has excellent bass fishing from the fishing pier\nAttend the free family fishing clinics held monthly	\N	\N	active	2026-09-23 06:24:28.152277+00	2026-09-23 06:24:28.152277+00	132
Saginaw Bay	saginaw-bay-115	Lake Huron bay with incredible walleye and perch fishing.	Michigan	Bay City	\N	USA	Saginaw Bay, Bay City, MI 48706	43.650000	-83.890000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for walleye with worm harnesses in summer\nFish the reefs for perch in fall\nTarget catfish near the river mouths	\N	\N	active	2026-09-23 06:24:15.854635+00	2026-09-23 06:24:15.854635+00	115
Hoover Dam	hoover-dam-116	Iconic dam on the Colorado River with excellent striped bass fishing in the tailwaters.	Nevada	Boulder City	\N	USA	Hoover Dam Access Rd, Boulder City, NV 89005	36.016000	-114.737700	dam	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the tailwaters for rainbow trout with PowerBait\nTarget stripers from the shore with swimbaits\nNight fishing for catfish near the dam face	\N	\N	active	2026-09-23 06:24:16.490243+00	2026-09-23 06:24:16.490243+00	116
Glen Canyon Dam	glen-canyon-dam-120	Famous for trophy trout fishing in the cold tailwaters of the Colorado River.	Arizona	Page	\N	USA	Glen Canyon Dam, Page, AZ 86040	36.940000	-111.480000	dam	\N	t	f	t	Free (License Required)	Year-round	Book a guided float trip through the canyon\nUse San Juan worms and midges\nFish early morning for best dry fly action	\N	\N	active	2026-09-23 06:24:19.071113+00	2026-09-23 06:24:19.071113+00	120
Bonneville Dam	bonneville-dam-117	Historic Columbia River dam famous for salmon and steelhead runs.	Oregon	Cascade Locks	\N	USA	Bonneville Dam, Cascade Locks, OR 97014	45.640000	-121.940000	dam	\N	t	f	t	Free (License Required)	Spring & Fall	Fish below the dam for spring chinook with herring\nTarget sturgeon with sand shrimp in the tailrace\nShad fishing is incredible in June	\N	\N	active	2026-09-23 06:24:17.142427+00	2026-09-23 06:24:17.142427+00	117
Hermann Park McGovern Lake	hermann-park-mcgovern-lake-129	Houston's premier urban fishing lake in the heart of the Museum District. The 8-acre lake is regularly stocked and offers easy bank access perfect for families with young children.	Texas	Houston	\N	USA	Hermann Park, Houston, TX 77030	29.722000	-95.390000	lake	\N	t	f	t	Free (License Required)	Year-round	Fish near the Japanese Garden bridge for catfish\nUse crickets or worms for bluegill along the shoreline\nEarly morning before joggers arrive is best for bass\nThe lake is stocked regularly - check Houston Parks for schedules	\N	\N	active	2026-09-23 06:24:25.569192+00	2026-09-23 06:24:25.569192+00	129
White Rock Lake	white-rock-lake-130	Dallas's urban fishing paradise covering 1,015 acres just 5 miles from downtown. The lake offers diverse fishing opportunities from shore or kayak with a scenic 9-mile trail.	Texas	Dallas	\N	USA	White Rock Lake Park, Dallas, TX 75218	32.820000	-96.720000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the spillway area for white bass during spring runs\nTarget rocky points for largemouth with crankbaits\nShore fish the east side for catfish with cut shad\nKayak fishing opens up the best coves and structure	\N	\N	active	2026-09-23 06:24:26.248512+00	2026-09-23 06:24:26.248512+00	130
Lake Nokomis	lake-nokomis-141	A Minneapolis Chain of Lakes gem offering excellent urban fishing with a swimming beach, playground, and picnic areas. The 204-acre lake is perfect for combining family activities with fishing.	Minnesota	Minneapolis	\N	USA	Lake Nokomis, Minneapolis, MN 55417	44.910000	-93.240000	lake	\N	t	f	t	Free (License Required)	Summer	Fish the weed edges for largemouth bass with spinnerbaits\nTarget northern pike near the inlet with large minnows\nShore fish the south beach area for bluegill with kids\nIce fish for walleye and panfish in winter - very popular	\N	\N	active	2026-09-23 06:24:35.366573+00	2026-09-23 06:24:35.366573+00	141
Central Park - Harlem Meer	central-park-harlem-meer-126	NYC's most iconic urban fishing spot in the heart of Central Park. The Dana Discovery Center provides free loaner fishing poles and bait from April through October, making it perfect for families and first-time anglers.	New York	New York	\N	USA	Harlem Meer, Central Park, New York, NY 10029	40.796800	-73.952000	lake	\N	t	f	t	Free (Catch & Release Only)	Spring & Summer	Borrow free fishing gear from the Dana Discovery Center\nUse worms under a bobber for bluegill - great for kids\nFish early morning before crowds arrive for best bass action\nTarget the deeper north end for larger bass and catfish	\N	\N	active	2026-09-23 06:24:22.91317+00	2026-09-23 06:24:22.91317+00	126
Family Fun Pay Lake	family-fun-pay-lake-125	Great for families with kids, no license required, guaranteed catches.	Indiana	Indianapolis	\N	USA	890 Family Fish Ln, Indianapolis, IN 46201	39.768400	-86.158100	pay-lake	\N	f	t	t	$25/person	Summer	Use worms under a bobber for bluegill\nTry chicken liver for catfish\nKids love fishing with corn for trout	\N	\N	active	2026-09-23 06:24:22.263784+00	2026-09-23 06:24:22.263784+00	125
Trophy Trout Pay Lake	trophy-trout-pay-lake-124	Pay-to-fish lake stocked with trophy-sized trout including rare golden trout.	Tennessee	Nashville	\N	USA	456 Fisherman Way, Nashville, TN 37201	36.162700	-86.781600	pay-lake	\N	f	t	t	$75/day	Winter & Spring	Use PowerBait in bright colors for stocked trout\nFish early morning for best action\nTry corn and worms for a natural presentation	\N	\N	active	2026-09-23 06:24:21.628695+00	2026-09-23 06:24:21.628695+00	124
Big Bear Lake Private Resort	big-bear-lake-private-resort-121	Exclusive private fishing resort with stocked waters and guaranteed catches.	California	Big Bear Lake	\N	USA	123 Private Lake Rd, Big Bear Lake, CA 92315	34.240000	-116.910000	private	\N	f	t	t	$150/day	Spring & Fall	Use PowerBait for stocked rainbow trout\nFish structure for brown trout with streamers\nEarly morning is best for bass on topwater	\N	\N	active	2026-09-23 06:24:19.694573+00	2026-09-23 06:24:19.694573+00	121
Lake Havasu	lake-havasu-134	One of the top bass fishing lakes in the West, set against stunning desert canyon scenery. The warm Colorado River water produces year-round bass fishing with multiple 10+ lb fish caught annually.	Arizona	Lake Havasu City	\N	USA	Lake Havasu, Lake Havasu City, AZ 86403	34.470000	-114.320000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the tules and cattail edges for spawning bass in spring\nTarget stripers near the dam with live shad or swimbaits\nFish the London Bridge area for easy shore access\nUse drop shot rigs on rocky points for smallmouth	\N	\N	active	2026-09-23 06:24:29.786617+00	2026-09-23 06:24:29.786617+00	134
Sloan's Lake	sloan-s-lake-138	Denver's largest lake offers excellent urban fishing with stunning Rocky Mountain views. Stocked with rainbow trout and warm-water species, it's a favorite for Denver families.	Colorado	Denver	\N	USA	Sloan's Lake Park, Denver, CO 80204	39.750000	-105.030000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish for stocked trout in spring and fall with PowerBait\nTarget bass in the weed beds with soft plastics in summer\nShore fish the south side for best catfish action at night\nIce fishing is popular in winter for trout and perch	\N	\N	active	2026-09-23 06:24:33.366349+00	2026-09-23 06:24:33.366349+00	138
Anacostia River	anacostia-river-137	The nation's capital offers surprisingly excellent urban fishing along the revitalized Anacostia River. Northern snakehead, an invasive but exciting gamefish, has made this a unique fishing destination.	Virginia	Washington	\N	USA	Anacostia River, Washington, DC 20003	38.880000	-76.970000	river	\N	f	t	t	Free (DC License Required)	Spring & Summer	Target snakehead in shallow weedy areas with topwater frogs\nFish Kenilworth Aquatic Gardens for bass and snakehead\nBlue catfish are abundant - use cut shad on the bottom\nThe Anacostia Riverwalk Trail provides great bank access	\N	\N	active	2026-09-23 06:24:32.378233+00	2026-09-23 06:24:32.378233+00	137
Prospect Park Lake	prospect-park-lake-127	Brooklyn's beloved urban fishing destination in Frederick Law Olmsted's masterpiece park. The 60-acre lake offers surprisingly good fishing just minutes from downtown Brooklyn.	New York	Brooklyn	\N	USA	Prospect Park, Brooklyn, NY 11215	40.660200	-73.969000	lake	\N	t	f	t	Free (Catch & Release Only)	Spring & Summer	Fish the Lullwater area for the best bass habitat\nUse bread balls for carp along the shoreline\nEarly morning weekdays offer the most peaceful fishing\nBring your own gear - no loaner programs available	\N	\N	active	2026-09-23 06:24:23.949556+00	2026-09-23 06:24:23.949556+00	127
Chatfield State Park Kids' Pond	chatfield-state-park-kids-pond-142	Colorado's best kids' fishing destination with a dedicated children's pond stocked weekly during summer. The shallow, accessible pond has paved paths, benches, and guaranteed catches for young anglers.	Colorado	Littleton	\N	USA	Chatfield State Park, Littleton, CO 80125	39.530000	-105.070000	lake	\N	f	t	t	State Park Fee ($10/vehicle)	Summer	The kids' pond is stocked every Thursday - fish Friday morning for best results\nUse worms under a bobber for bluegill - perfect for beginners\nPowerBait in bright colors works great for stocked trout\nBring a picnic - there are tables and shade right by the pond	\N	\N	active	2026-09-23 06:24:36.080037+00	2026-09-23 06:24:36.080037+00	142
Lake Merritt	lake-merritt-135	America's oldest wildlife refuge is also a unique urban fishing spot in downtown Oakland. This tidal lagoon connected to San Francisco Bay offers surprising saltwater species in a city setting.	California	Oakland	\N	USA	Lake Merritt, Oakland, CA 94612	37.800000	-122.250000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Fish incoming tides for striped bass near the channel\nTarget bat rays with squid on the bottom at night\nUse pile worms for perch along the shoreline\nThe 12th Street bridge area is the most productive spot	\N	\N	active	2026-09-23 06:24:30.437074+00	2026-09-23 06:24:30.437074+00	135
Henry's Lake	henry-s-lake-153	One of the premier trophy trout lakes in the West, producing cutthroat trout averaging 3-5 lbs. Located near Yellowstone, it's a must-visit for serious trout anglers.	Idaho	Island Park	\N	USA	Henry's Lake, Island Park, ID 83429	44.610000	-111.380000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Fish leeches and damselfly nymphs for trophy cutthroat\nFloat tube fishing is the most effective method\nTarget the inlet streams in early summer for cruising fish\nUse woolly buggers stripped slowly along weed edges	\N	\N	active	2026-09-23 06:24:45.335628+00	2026-09-23 06:24:45.335628+00	153
Westmoreland Park Casting Pond	westmoreland-park-casting-pond-140	Portland's beloved urban fishing pond in the heart of SE Portland. Stocked with rainbow trout by ODFW, it's a perfect spot for teaching kids to fish with easy bank access and a playground nearby.	Oregon	Portland	\N	USA	Westmoreland Park, Portland, OR 97202	45.470000	-122.650000	lake	\N	t	f	t	Free (License Required)	Spring	Fish right after ODFW stocking for best trout action\nUse PowerBait or worms under a bobber for kids\nThe east bank has the deepest water and best trout holding areas\nCombine fishing with a visit to the adjacent playground	\N	\N	active	2026-09-23 06:24:34.713867+00	2026-09-23 06:24:34.713867+00	140
Lady Bird Lake	lady-bird-lake-131	Austin's iconic downtown reservoir on the Colorado River, home to the state fish - the Guadalupe Bass. Kayak and paddleboard fishing are popular with stunning skyline views.	Texas	Austin	\N	USA	Lady Bird Lake, Austin, TX 78701	30.250000	-97.750000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Kayak fish the coves near Red Bud Isle for bass\nTarget Guadalupe bass near rocky structure with small crankbaits\nFish under the Congress Avenue Bridge at dawn for best action\nMotorized boats are prohibited - paddle craft only	\N	\N	active	2026-09-23 06:24:26.876195+00	2026-09-23 06:24:26.876195+00	131
Burke Lake	burke-lake-143	Northern Virginia's premier family fishing lake with a fishing pier, boat rentals, playground, carousel, and mini-train. The 218-acre lake is stocked regularly and offers excellent shoreline access.	Virginia	Fairfax Station	\N	USA	Burke Lake Park, Fairfax Station, VA 22039	38.760000	-77.290000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish from the pier for easy access with kids\nUse nightcrawlers under a bobber for bluegill and crappie\nRent a rowboat to access deeper bass and catfish areas\nThe marina cove is the best spot for young anglers	\N	\N	active	2026-09-23 06:24:36.755834+00	2026-09-23 06:24:36.755834+00	143
Lake Ella	lake-ella-144	Tallahassee's charming urban lake surrounded by shops and restaurants. The small, accessible lake is perfect for introducing kids to fishing with easy shoreline access and shallow water.	Florida	Tallahassee	\N	USA	Lake Ella, Tallahassee, FL 32303	30.460000	-84.280000	lake	\N	t	f	t	Free (License Required)	Year-round	Use bread balls for tilapia and carp - kids love the instant action\nFish worms under a bobber for bluegill along the shore\nTarget bass near the fountain with small plastic worms\nCombine fishing with a treat from the surrounding shops	\N	\N	active	2026-09-23 06:24:37.400751+00	2026-09-23 06:24:37.400751+00	144
Greenfield Lake	greenfield-lake-145	A beautiful cypress-lined lake in Wilmington with a 5-mile trail, playground, and amphitheater. The shallow, warm lake is perfect for kids with easy bank access and abundant panfish.	North Carolina	Wilmington	\N	USA	Greenfield Lake Park, Wilmington, NC 28401	34.210000	-77.940000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish near the cypress trees for bass with plastic worms\nUse crickets for bluegill along the walking trail\nThe fishing pier near the amphitheater is great for kids\nWatch for alligators - they're part of the experience!	\N	\N	active	2026-09-23 06:24:38.079186+00	2026-09-23 06:24:38.079186+00	145
Killens Pond	killens-pond-151	Delaware's most popular family fishing destination with a water park, nature center, and campground. The 66-acre pond is stocked regularly and has excellent shoreline access.	Delaware	Felton	\N	USA	Killens Pond State Park, Felton, DE 19943	39.020000	-75.540000	lake	\N	t	f	t	State Park Fee + License	Spring & Summer	Fish from the pier near the nature center for easy panfish\nUse worms and bobbers for bluegill - perfect for kids\nTarget bass in the lily pads with topwater frogs\nCombine fishing with the water park for a full family day	\N	\N	active	2026-09-23 06:24:43.042332+00	2026-09-23 06:24:43.042332+00	151
Mirror Lake State Park	mirror-lake-state-park-147	A stunning sandstone-cliff lake near Wisconsin Dells, perfect for combining family vacation with fishing. The calm, clear water and sandy beaches make it ideal for kids.	Wisconsin	Baraboo	\N	USA	Mirror Lake State Park, Baraboo, WI 53913	43.560000	-89.800000	lake	\N	f	t	t	State Park Fee ($8/vehicle)	Summer	Fish from the canoe/kayak for best access to bass habitat\nUse worms near the sandy beach for bluegill with kids\nTarget pike in the lily pads at the north end\nCombine with a visit to nearby Wisconsin Dells attractions	\N	\N	active	2026-09-23 06:24:40.261391+00	2026-09-23 06:24:40.261391+00	147
Ala Wai Canal	ala-wai-canal-152	Waikiki's urban fishing canal where locals and tourists fish for papio and tilapia. An accessible spot just steps from the famous beach, offering a unique tropical urban fishing experience.	Hawaii	Honolulu	\N	USA	Ala Wai Canal, Honolulu, HI 96815	21.280000	-157.830000	river	\N	t	f	t	Free (License Required)	Year-round	Fish the mouth near the harbor for papio on incoming tides\nUse bread balls or shrimp for tilapia along the canal walls\nEarly morning and evening are best to avoid the heat\nBring a net - the canal walls make landing fish tricky	\N	\N	active	2026-09-23 06:24:43.711355+00	2026-09-23 06:24:43.711355+00	152
Wabash River	wabash-river-32	Indiana's official state river with excellent smallmouth and catfish.	Indiana	Lafayette	\N	USA	Wabash River, Lafayette, IN 47901	40.416700	-86.875300	river	\N	t	f	t	Free (License Required)	Summer	Wade fish riffles for smallmouth with tube jigs\nFish deep holes for flathead catfish at night\nTarget dam tailwaters for sauger in fall	\N	\N	active	2026-09-23 06:23:12.701814+00	2026-09-23 06:23:12.701814+00	32
Clear Lake	clear-lake-154	Iowa's third-largest natural lake and a popular family vacation destination. Known for excellent yellow bass fishing and a charming lakeside town with resorts and restaurants.	Iowa	Clear Lake	\N	USA	Clear Lake, Clear Lake, IA 50428	43.140000	-93.380000	lake	\N	t	f	t	Free (License Required)	Summer & Winter	Target yellow bass schools with small jigs and minnows\nFish the rock reefs for walleye at dawn and dusk\nIce fishing for walleye and perch is outstanding\nThe south shore has the best family-friendly access points	\N	\N	active	2026-09-23 06:24:46.395551+00	2026-09-23 06:24:46.395551+00	154
El Dorado Reservoir	el-dorado-reservoir-155	Kansas' most popular state park lake with 8,000 acres of excellent multi-species fishing. The park offers camping, swimming beaches, and extensive shoreline access for families.	Kansas	El Dorado	\N	USA	El Dorado State Park, El Dorado, KS 67042	37.820000	-96.860000	lake	\N	f	t	t	State Park Fee + License	Spring & Fall	Fish the white bass run at the Walnut River inlet in spring\nTroll for walleye with bottom bouncers along the dam\nTarget crappie in brush piles near the marina\nNight fishing for catfish at the spillway is excellent	\N	\N	active	2026-09-23 06:24:47.362949+00	2026-09-23 06:24:47.362949+00	155
Wachusett Reservoir	wachusett-reservoir-158	Central Massachusetts' premier cold-water fishery and Boston's drinking water supply. Shore fishing only with strict regulations, but produces trophy lake trout and salmon.	Massachusetts	West Boylston	\N	USA	Wachusett Reservoir, West Boylston, MA 01583	42.380000	-71.720000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Shore fish only - no boats allowed on this reservoir\nCast large spoons for lake trout from accessible points\nFish the spring stocking for rainbow and brown trout\nThe south shore access points offer the best casting	\N	\N	active	2026-09-23 06:24:49.931209+00	2026-09-23 06:24:49.931209+00	158
Worden Pond	worden-pond-165	Rhode Island's largest freshwater body at 1,043 acres. A shallow, weedy lake that produces trophy largemouth bass and pickerel in a peaceful, undeveloped setting.	Rhode Island	Wakefield	\N	USA	Worden Pond, Wakefield, RI 02879	41.420000	-71.680000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish the weed edges for trophy largemouth with frogs and buzzbaits\nTarget pickerel in the lily pads with spinnerbaits\nUse worms under a bobber for perch and bluegill\nCanoe or kayak access opens up the best fishing areas	\N	\N	active	2026-09-23 06:24:55.440791+00	2026-09-23 06:24:55.440791+00	165
Blue Mesa Reservoir	blue-mesa-reservoir-15	Colorado's largest body of water with excellent kokanee and lake trout fishing.	Colorado	Gunnison	\N	USA	Blue Mesa Reservoir, Gunnison, CO 81230	38.450000	-107.330000	lake	\N	t	f	t	Free (License Required)	Summer	Troll for kokanee with wedding ring spinners\nJig for lake trout near the dam in winter\nFish tributary inlets in spring for rainbows	\N	\N	active	2026-09-23 06:22:56.424758+00	2026-09-23 06:22:56.424758+00	15
Liberty Reservoir	liberty-reservoir-157	Baltimore's drinking water reservoir offering trophy brown trout and tiger muskie fishing. Electric motors only create a peaceful, uncrowded fishing experience.	Maryland	Eldersburg	\N	USA	Liberty Reservoir, Eldersburg, MD 21784	39.420000	-76.920000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Troll for brown trout with Rapala minnows in spring\nTarget tiger muskie with large jerkbaits near rocky points\nFish the upper arms for bass in the warmer months\nElectric motors only - plan for a quiet, peaceful trip	\N	\N	active	2026-09-23 06:24:48.958406+00	2026-09-23 06:24:48.958406+00	157
Squam Lake	squam-lake-161	The filming location of 'On Golden Pond' and one of New Hampshire's most pristine lakes. Excellent cold-water fishing in a stunning natural setting with loon calls echoing across the water.	New Hampshire	Holderness	\N	USA	Squam Lake, Holderness, NH 03245	43.760000	-71.610000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Troll for salmon with lead core line in spring after ice-out\nFish the islands for smallmouth bass with crawfish patterns\nTarget lake trout deep near Rattlesnake Island\nRespect the peaceful atmosphere - this is a quiet lake	\N	\N	active	2026-09-23 06:24:52.766869+00	2026-09-23 06:24:52.766869+00	161
Merritt Reservoir	merritt-reservoir-160	A Sandhills gem known for trophy muskie and walleye in a remote, scenic setting. The clear water and abundant forage produce exceptional fish growth rates.	Nebraska	Valentine	\N	USA	Merritt Reservoir, Valentine, NE 69201	42.050000	-100.160000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Target muskie with large bucktails and jerkbaits in fall\nFish rocky points for walleye at dawn with jigs and minnows\nThe Snake River arm has the best bass fishing\nNight fishing for walleye near the dam is very productive	\N	\N	active	2026-09-23 06:24:52.116535+00	2026-09-23 06:24:52.116535+00	160
Spruce Run Reservoir	spruce-run-reservoir-162	Central New Jersey's top multi-species fishery with 1,290 acres of excellent fishing. The reservoir is stocked with trout and hybrid stripers, and has a swimming beach and campground.	New Jersey	Clinton	\N	USA	Spruce Run Recreation Area, Clinton, NJ 08809	40.660000	-74.860000	lake	\N	f	t	t	State Park Fee + License	Spring & Summer	Troll for hybrid stripers with crankbaits near the dam\nFish the inlet area for trout after spring stocking\nTarget pike in the weed beds with large spinnerbaits\nThe south shore has the best family-friendly access	\N	\N	active	2026-09-23 06:24:53.416719+00	2026-09-23 06:24:53.416719+00	162
Flathead Lake	flathead-lake-159	The largest natural freshwater lake west of the Mississippi, with crystal-clear water and stunning Mission Mountain views. Trophy lake trout over 30 lbs are caught annually.	Montana	Polson	\N	USA	Flathead Lake, Polson, MT 59860	47.880000	-114.150000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Troll deep for lake trout with large spoons and downriggers\nFish the east shore for yellow perch with small jigs\nTarget bull trout near river mouths in fall - catch and release only\nThe Narrows area between Big and Little Flathead is prime	\N	\N	active	2026-09-23 06:24:50.547055+00	2026-09-23 06:24:50.547055+00	159
Heron Lake	heron-lake-163	New Mexico's premier cold-water fishery at 7,186 feet elevation. A no-wake lake offering peaceful fishing for kokanee salmon and trophy trout in a stunning mountain setting.	New Mexico	Los Ojos	\N	USA	Heron Lake State Park, Los Ojos, NM 87551	36.670000	-106.730000	lake	\N	t	f	t	Free (License Required)	Summer & Fall	Troll for kokanee with dodger and fly combos in summer\nFish deep for lake trout with large spoons near the dam\nShore fish for stocked rainbow trout with PowerBait\nThe no-wake rule makes this perfect for kayak fishing	\N	\N	active	2026-09-23 06:24:54.077253+00	2026-09-23 06:24:54.077253+00	163
Lake Memphremagog	lake-memphremagog-167	A stunning international lake straddling the US-Canada border with excellent cold-water fishing. The deep, clear water produces trophy salmon and lake trout in a beautiful mountain setting.	Vermont	Newport	\N	USA	Lake Memphremagog, Newport, VT 05855	44.940000	-72.200000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Troll for salmon with streamer flies in spring\nFish the South Bay for walleye and pike\nTarget smallmouth on rocky shoals with tube jigs\nThe deep basin near the border produces trophy lakers	\N	\N	active	2026-09-23 06:24:57.134322+00	2026-09-23 06:24:57.134322+00	167
Big Sioux River	big-sioux-river-166	An underrated urban fishery flowing through Sioux Falls with excellent walleye and catfish. Falls Park provides a scenic backdrop for fishing in the heart of the city.	South Dakota	Sioux Falls	\N	USA	Big Sioux River, Sioux Falls, SD 57104	43.550000	-96.730000	river	\N	t	f	t	Free (License Required)	Spring & Summer	Fish below the falls for walleye with jigs and minnows\nTarget catfish in deep pools with cut bait\nWade fish the riffles for smallmouth in summer\nThe stretch through town has multiple public access points	\N	\N	active	2026-09-23 06:24:56.433486+00	2026-09-23 06:24:56.433486+00	166
Bighorn River	bighorn-river-169	One of the finest tailwater trout fisheries in the world below Boysen Reservoir. The nutrient-rich water produces trout averaging 16-18 inches with fish over 20 inches common.	Wyoming	Thermopolis	\N	USA	Bighorn River, Thermopolis, WY 82443	43.650000	-108.210000	river	\N	t	f	t	Free (License Required)	Year-round	Fish scuds and sowbugs below the dam for trophy trout\nUse San Juan worms during high water for consistent action\nFloat the Wedding of the Waters section for best access\nDry fly fishing is excellent during summer caddis hatches	\N	\N	active	2026-09-23 06:24:58.464366+00	2026-09-23 06:24:58.464366+00	169
Stonewall Jackson Lake	stonewall-jackson-lake-168	A scenic 2,650-acre lake with a resort lodge, golf course, and excellent family fishing. The lake is managed for trophy bass and muskie with strict slot limits.	West Virginia	Roanoke	\N	USA	Stonewall Jackson Lake State Park, Roanoke, WV 26423	38.880000	-80.460000	lake	\N	t	f	t	Free (License Required)	Spring & Summer	Fish the standing timber for crappie with jigs and minnows\nTarget bass along the shoreline with spinnerbaits in spring\nThe upper arms have the best muskie habitat\nRent a boat from the marina for best access to fishing spots	\N	\N	active	2026-09-23 06:24:57.794458+00	2026-09-23 06:24:57.794458+00	168
Garrison Dam Tailrace	garrison-dam-tailrace-164	One of the most productive tailwater fisheries in the northern plains. The cold, oxygen-rich water below Garrison Dam supports incredible walleye and salmon fishing year-round.	North Dakota	Riverdale	\N	USA	Garrison Dam, Riverdale, ND 58565	47.510000	-101.420000	dam	\N	t	f	t	Free (License Required)	Spring & Fall	Fish jigs tipped with minnows for walleye near the discharge\nTarget chinook salmon with spoons in the fast water\nThe bank fishing access is excellent on both sides\nWinter fishing for walleye below the dam is outstanding	\N	\N	active	2026-09-23 06:24:54.785698+00	2026-09-23 06:24:54.785698+00	164
Beaver Lake	beaver-lake-170	Northwest Arkansas' premier lake in the heart of the Ozarks. Crystal-clear water, stunning bluffs, and excellent multi-species fishing make it a top family destination.	Arkansas	Rogers	\N	USA	Beaver Lake, Rogers, AR 72756	36.350000	-93.850000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the bluffs for spotted bass with jerkbaits and drop shots\nTarget stripers near the dam with live shad in summer\nThe War Eagle Creek arm has the best crappie fishing\nWalleye fishing is excellent near the dam in winter	\N	\N	active	2026-09-23 06:24:59.122932+00	2026-09-23 06:24:59.122932+00	170
Lake Guntersville	lake-guntersville-1	Consistently ranked as one of the best bass lakes in America with massive grass beds.	Alabama	Guntersville	\N	USA	Lake Guntersville, Guntersville, AL 35976	34.350100	-86.293900	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the grass edges with swimbaits in spring\nTarget bridge pilings for crappie in winter\nUse topwater frogs over matted vegetation in summer	\N	\N	active	2026-09-23 06:22:43.241443+00	2026-09-23 06:22:43.241443+00	1
Norris Lake	norris-lake-89	Crystal-clear TVA lake with outstanding striped bass and walleye.	Tennessee	Rocky Top	\N	USA	Norris Lake, Rocky Top, TN 37769	36.220000	-84.080000	lake	\N	t	f	t	Free (License Required)	Spring & Fall	Fish the thermocline for stripers in summer\nTarget walleye near the dam with jigs\nFish rocky banks for smallmouth with crawfish	\N	\N	active	2026-09-23 06:23:57.057699+00	2026-09-23 06:23:57.057699+00	89
Lincoln Park Lagoon	lincoln-park-lagoon-128	A hidden urban fishing gem in Chicago's most popular park. The South Lagoon offers peaceful fishing with stunning skyline views, and the Chicago Park District hosts free family fishing events.	Illinois	Chicago	\N	USA	Lincoln Park, Chicago, IL 60614	41.921400	-87.635200	lake	\N	t	f	t	Free (License Required)	Summer	Fish the South Lagoon near Café Brauer for best access\nUse worms and bobbers for guaranteed bluegill action with kids\nTarget catfish at dusk with chicken liver or stink bait\nJoin the free Chicago Park District fishing programs in summer	\N	\N	active	2026-09-23 06:24:24.932447+00	2026-09-23 06:24:24.932447+00	128
Mississippi River - Pool 9	mississippi-river-pool-9-34	Incredible backwater fishing on the Upper Mississippi with diverse species.	Iowa	Lansing	\N	USA	Mississippi River, Lansing, IA 52151	43.360000	-91.220000	river	\N	t	f	t	Free (License Required)	Spring & Fall	Fish wing dams for walleye with jigs\nTarget backwater sloughs for bass and bluegill\nUse cut shad for catfish in the main channel	\N	\N	active	2026-09-23 06:23:14.70386+00	2026-09-23 06:23:14.70386+00	34
New River	new-river-102	Ancient river with spectacular gorge scenery and excellent smallmouth fishing.	West Virginia	Fayetteville	\N	USA	New River Gorge, Fayetteville, WV 25840	38.060000	-81.080000	river	\N	t	f	t	Free (License Required)	Summer	Float the gorge section for smallmouth with tubes\nFish deep pools for flathead catfish at night\nTarget muskie in the lower river with large lures	\N	\N	active	2026-09-23 06:24:06.688328+00	2026-09-23 06:24:06.688328+00	102
\.


--
-- Data for Name: lodging; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".lodging (id, name, type, state, state_abbr, city, price_range, price_per_night_min, price_per_night_max, proximity_to_water, amenities, booking_url, rating, review_count, description, phone, pet_friendly, seasonal, season_open, season_close, created_at, updated_at) FROM stdin;
11	Kenai River Lodge	lodge	Alaska	AK	Soldotna	$$$$	349	599	Riverfront	{WiFi,"Guide Service","Meals Included","Waders Provided"}	https://www.booking.com	4.9	156	All-inclusive lodge on the world-famous Kenai River.	(907) 555-0198	f	t	May	September	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
12	Kodiak Island Camp	campground	Alaska	AK	Kodiak	$$	75	125	Waterfront	{"Tent Platforms","Bear Boxes","Guide Service"}	https://www.recreation.gov	4.7	89	Remote fishing camp on Kodiak Island with salmon runs.	(907) 555-0234	f	t	June	September	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
13	Anchorage Fishing Hotel	hotel	Alaska	AK	Anchorage	$$$	169	289	15 miles	{WiFi,Restaurant,Parking,"Shuttle Service"}	https://www.hotels.com	4.3	423	Comfortable base camp for Alaska fishing adventures.	(907) 555-0145	t	f	\N	\N	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
14	Yellowstone River Lodge	lodge	Montana	MT	Livingston	$$$$	299	499	Riverfront	{WiFi,"Guide Service","Fly Shop","Gourmet Meals","Hot Tub"}	https://www.booking.com	4.9	178	Luxury fly fishing lodge on the Yellowstone River.	(406) 555-0189	f	t	April	November	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
15	Big Sky Fishing Cabins	cabin	Montana	MT	West Yellowstone	$$$	159	279	0.2 miles	{Kitchen,Fireplace,"Hot Tub","Mountain Views"}	https://www.vrbo.com	4.7	145	Rustic-luxury cabins near the Madison River.	(406) 555-0156	t	t	May	October	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
16	Lake of the Woods Resort	resort	Minnesota	MN	Baudette	$$$	179	349	Lakefront	{WiFi,Restaurant,"Guide Service","Boat Rental","Bait Shop"}	https://www.booking.com	4.6	234	Year-round fishing resort on Lake of the Woods.	(218) 555-0178	t	f	\N	\N	2026-03-21 20:36:26.040442+00	2026-03-21 20:36:26.040442+00
17	Boundary Waters Camp	campground	Minnesota	MN	Ely	$	30	65	Lakefront	{"Canoe Rental","Bear Boxes","Fire Grate"}	https://www.recreation.gov	4.8	167	Gateway to the Boundary Waters Canoe Area.	(218) 555-0134	t	t	May	September	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
18	Mille Lacs Fishing Hotel	hotel	Minnesota	MN	Garrison	$$	109	179	0.5 miles	{WiFi,Pool,"Hot Tub",Breakfast}	https://www.hotels.com	4.4	312	Comfortable hotel on Mille Lacs Lake for walleye.	(320) 555-0145	t	f	\N	\N	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
19	Outer Banks Fishing Lodge	lodge	North Carolina	NC	Hatteras	$$$	199	359	0.1 miles	{WiFi,"Guide Service","Tackle Room","Kayak Rental"}	https://www.booking.com	4.6	198	Oceanfront lodge on the Outer Banks for surf fishing.	(252) 555-0189	t	f	\N	\N	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
20	Mountain Trout Cabins	cabin	North Carolina	NC	Bryson City	$$	109	189	Streamside	{Kitchen,Fireplace,Porch,Grill}	https://www.vrbo.com	4.7	156	Streamside cabins in the Great Smoky Mountains.	(828) 555-0167	t	f	\N	\N	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
21	Rogue River Resort	resort	Oregon	OR	Gold Beach	$$$$	269	449	Riverfront	{WiFi,Restaurant,"Guide Service",Spa,Pool}	https://www.booking.com	4.8	213	Premier resort on the wild Rogue River.	(541) 555-0198	f	t	March	November	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
22	Deschutes River Camp	campground	Oregon	OR	Maupin	$	20	40	Riverfront	{"Fire Pits",Restrooms,"Boat Ramp"}	https://www.recreation.gov	4.5	178	Riverside camping on the legendary Deschutes River.	(541) 555-0134	t	t	April	October	2026-03-21 20:36:37.148436+00	2026-03-21 20:36:37.148436+00
23	Door County Fishing Lodge	lodge	Wisconsin	WI	Sturgeon Bay	$$$	169	289	0.3 miles	{WiFi,Restaurant,"Guide Service","Boat Rental"}	https://www.booking.com	4.5	187	Charming lodge in Door County with Lake Michigan access.	(920) 555-0178	t	f	\N	\N	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
24	Hayward Muskie Cabins	cabin	Wisconsin	WI	Hayward	$$	99	179	Lakefront	{Kitchen,"Boat Dock","Fish Cleaning Station",Canoe}	https://www.vrbo.com	4.6	145	Lakefront cabins in the Muskie Capital of the World.	(715) 555-0156	t	f	\N	\N	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
25	South Platte River Lodge	lodge	Colorado	CO	Deckers	$$$$	279	459	Riverfront	{WiFi,"Guide Service","Fly Shop","Gourmet Meals","Hot Tub"}	https://www.booking.com	4.8	134	Exclusive fly fishing lodge on the South Platte River.	(303) 555-0189	f	t	April	November	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
26	Blue Mesa Campground	campground	Colorado	CO	Gunnison	$	25	50	0.1 miles	{"Boat Ramp","Fire Pits",Restrooms,"Picnic Tables"}	https://www.recreation.gov	4.4	198	Scenic campground on Blue Mesa Reservoir.	(970) 555-0145	t	t	May	September	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
27	Venice Marina Lodge	lodge	Louisiana	LA	Venice	$$$	189	329	Marina Access	{WiFi,Restaurant,"Guide Service","Boat Rental","Bait Shop"}	https://www.booking.com	4.5	267	Premier lodge at the mouth of the Mississippi River.	(504) 555-0198	f	f	\N	\N	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
28	Toledo Bend Cabins	cabin	Louisiana	LA	Many	$$	89	159	Lakefront	{Kitchen,"Boat Dock","Fish Cleaning Station",Grill}	https://www.vrbo.com	4.6	178	Lakefront cabins on Toledo Bend Reservoir.	(318) 555-0167	t	f	\N	\N	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
29	Thousand Islands Resort	resort	New York	NY	Alexandria Bay	$$$	199	369	Waterfront	{WiFi,Restaurant,"Guide Service","Boat Rental",Pool}	https://www.booking.com	4.6	234	Island resort in the heart of the Thousand Islands.	(315) 555-0189	t	t	May	October	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
30	Adirondack Trout Camp	campground	New York	NY	Lake Placid	$	30	55	0.2 miles	{"Canoe Rental","Fire Pits",Restrooms,"Hiking Trails"}	https://www.recreation.gov	4.7	145	Wilderness camping in the Adirondack Mountains.	(518) 555-0134	t	t	May	September	2026-03-21 20:36:51.46913+00	2026-03-21 20:36:51.46913+00
31	Lake Guntersville Lodge	lodge	Alabama	AL	Guntersville	$$$	159	289	Lakefront on Lake Guntersville	{"Boat Dock","Fish Cleaning Station",Restaurant,Pool,WiFi,"Bait Shop"}	https://booking.com	4.6	87	Premier fishing lodge on Lake Guntersville with private boat dock and guide services. Wake up to stunning lake views and walk to your boat.	(256) 555-0101	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
32	Wheeler Lake Campground	campground	Alabama	AL	Decatur	$	25	45	200 yards from Wheeler Lake	{"Fire Pits","Boat Ramp",Restrooms,"Picnic Tables","Electric Hookups"}	https://booking.com	4.2	54	Shaded campground with easy access to Wheeler Lake. Full hookups available for RVs and tent sites nestled among hardwoods.	(256) 555-0102	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
33	Mobile Bay Waterfront Hotel	hotel	Alabama	AL	Mobile	$$	109	179	On Mobile Bay	{WiFi,Pool,Restaurant,"Kayak Rentals",Parking,"Fitness Center"}	https://booking.com	4.3	112	Modern waterfront hotel overlooking Mobile Bay. Perfect base for inshore saltwater fishing with charter services nearby.	(251) 555-0103	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
92	Pyramid Lake Tribal Lodge	lodge	Nevada	NV	Sutcliffe	$$	89	159	On Pyramid Lake	{WiFi,Restaurant,"Tackle Shop",Parking,"Guide Service"}	https://booking.com	4.3	45	Tribal-operated lodge on ancient Pyramid Lake. Fish for trophy Lahontan cutthroat trout over 20 lbs.	(775) 555-2102	f	t	October	June	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
1	Angler's Waterfront Resort	resort	Florida	FL	Islamorada	$$$$	289	549	Waterfront	{WiFi,Pool,"Boat Dock",Restaurant}	https://www.booking.com	0.0	0	Premier Keys fishing resort with private boat slips and guided charters.	(305) 555-0142	f	f	\N	\N	2026-03-21 20:36:02.88499+00	2026-03-21 20:36:02.88499+00
34	Lake Powell Houseboat Rentals	resort	Arizona	AZ	Page	$$$$	350	750	On Lake Powell	{Houseboat,Kitchen,Waterslide,"Fishing Deck","BBQ Grill",Kayaks}	https://booking.com	4.7	93	Experience Lake Powell from a luxury houseboat. Fish right from your floating home surrounded by stunning red rock canyons.	(928) 555-0201	f	t	March	November	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
35	Marble Canyon Lodge	lodge	Arizona	AZ	Marble Canyon	$$	99	169	0.5 miles from Colorado River at Lees Ferry	{Restaurant,WiFi,"Fly Shop","Guide Service",Parking}	https://booking.com	4.4	67	Historic lodge near Lees Ferry, the gateway to world-class trout fishing on the Colorado River. Guides available daily.	(928) 555-0202	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
36	Page Lakeside Cabins	cabin	Arizona	AZ	Page	$$	119	199	1 mile from Lake Powell Marina	{Kitchen,WiFi,Patio,BBQ,Parking,Laundry}	https://booking.com	4.3	45	Cozy cabins near Lake Powell with full kitchens for cooking your catch. Beautiful desert views and easy marina access.	(928) 555-0203	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
37	White River Trout Lodge	lodge	Arkansas	AR	Bull Shoals	$$$	175	325	On the White River	{"Guide Service","Boat Dock","Fish Cleaning Station",Restaurant,WiFi,"Fly Shop"}	https://booking.com	4.8	156	Premier trout fishing lodge on the legendary White River. All-inclusive packages with expert guides and gourmet meals.	(870) 555-0301	f	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
38	Lake Ouachita Camping Resort	campground	Arkansas	AR	Hot Springs	$	30	55	Lakefront on Lake Ouachita	{"Boat Ramp","Swimming Beach","Fire Pits",Showers,"Electric Hookups","Camp Store"}	https://booking.com	4.4	89	Beautiful lakefront camping on crystal-clear Lake Ouachita. Tent and RV sites with stunning mountain views.	(501) 555-0302	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
39	Bull Shoals Riverside Cabins	cabin	Arkansas	AR	Bull Shoals	$$	95	165	On the White River	{Kitchen,Porch,"Fish Cleaning Station",WiFi,Parking,"Canoe Rentals"}	https://booking.com	4.5	73	Charming riverside cabins with screened porches overlooking the White River. Walk to some of the best trout water in America.	(870) 555-0303	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
40	Lake Tahoe Luxury Resort	resort	California	CA	South Lake Tahoe	$$$$	299	599	Lakefront on Lake Tahoe	{Spa,Pool,Restaurant,Marina,"Ski Shuttle",WiFi,"Fitness Center","Valet Parking"}	https://booking.com	4.7	234	World-class lakefront resort on Lake Tahoe with private marina. Fish for mackinaw and rainbow trout steps from your room.	(530) 555-0401	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
41	San Diego Harbor Inn	hotel	California	CA	San Diego	$$$	179	329	On San Diego Bay	{WiFi,Pool,Restaurant,Concierge,Parking,"Charter Desk"}	https://booking.com	4.5	187	Waterfront hotel on San Diego Bay with charter fishing desk in the lobby. Walk to sportfishing landings.	(619) 555-0402	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
42	Sacramento River RV Park	rv_park	California	CA	Redding	$	35	65	100 yards from Sacramento River	{"Full Hookups","Fish Cleaning Station",Laundry,WiFi,"Boat Parking","Camp Store"}	https://booking.com	4.2	56	Riverside RV park with direct access to the Sacramento River. Perfect for salmon and steelhead anglers.	(530) 555-0403	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
43	Candlewood Lake Inn	hotel	Connecticut	CT	New Fairfield	$$	129	219	0.5 miles from Candlewood Lake	{WiFi,"Continental Breakfast",Parking,"Boat Trailer Parking","Fitness Center"}	https://booking.com	4.1	43	Comfortable inn near Candlewood Lake with oversized parking for boats and trailers. Easy access to all launch ramps.	(203) 555-0501	t	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
44	Housatonic River Retreat	cabin	Connecticut	CT	Cornwall	$$$	165	275	On the Housatonic River	{Kitchen,Fireplace,Porch,WiFi,"Fly Fishing Gear","Private River Access"}	https://booking.com	4.6	38	Secluded riverside cabins with private access to the Housatonic River. Fly rods and waders available for guests.	(860) 555-0502	f	f	\N	\N	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
45	Cornwall Bridge Campground	campground	Connecticut	CT	Cornwall	$	28	42	300 yards from Housatonic River	{"Fire Pits",Restrooms,"Picnic Tables","Hiking Trails"}	https://booking.com	4.0	29	Rustic campground in the Litchfield Hills near premier Housatonic River trout water.	(860) 555-0503	t	t	April	October	2026-03-23 20:33:12.635601+00	2026-03-23 20:33:12.635601+00
46	Delaware Bay Beach Hotel	hotel	Delaware	DE	Lewes	$$	119	209	On Delaware Bay	{WiFi,Pool,Restaurant,"Beach Access",Parking,"Fishing Pier"}	https://booking.com	4.3	67	Beachfront hotel on Delaware Bay with private fishing pier. Walk to surf fishing and charter boats.	(302) 555-0601	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
47	Lums Pond Campground	campground	Delaware	DE	Bear	$	22	38	On Lums Pond	{"Boat Ramp",Restrooms,"Fire Pits","Hiking Trails","Kayak Rentals"}	https://booking.com	4.1	34	State park campground on Delaware's largest freshwater pond. Excellent bass and panfish right from your campsite.	(302) 555-0602	t	t	March	November	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
48	Rehoboth Fishing Suites	hotel	Delaware	DE	Rehoboth Beach	$$$	159	289	0.5 miles from Indian River Inlet	{Kitchen,WiFi,Pool,Balcony,Parking,"Fish Cleaning Station"}	https://booking.com	4.4	52	Suite-style hotel near Indian River Inlet with kitchens for cooking your catch and fish cleaning stations.	(302) 555-0603	f	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
49	Lake Lanier Island Resort	resort	Georgia	GA	Buford	$$$	189	349	On Lake Lanier	{Marina,Pool,Restaurant,Golf,Spa,WiFi,"Water Park",Beach}	https://booking.com	4.5	198	Full-service resort on Lake Lanier with private marina and boat rentals. Fish for spotted bass and stripers.	(770) 555-0701	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
50	Altamaha River Fish Camp	campground	Georgia	GA	Jesup	$	20	35	On the Altamaha River	{"Boat Ramp","Fish Cleaning Station","Fire Pits",Restrooms,"Bait Shop"}	https://booking.com	4.2	41	Rustic fish camp on Georgia's largest free-flowing river. Launch your boat steps from your campsite.	(912) 555-0702	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
51	Chattooga River Mountain Cabin	cabin	Georgia	GA	Clayton	$$$	145	265	0.25 miles from Chattooga River	{Kitchen,"Hot Tub",Fireplace,Porch,WiFi,Grill}	https://booking.com	4.7	56	Luxurious mountain cabin near the wild and scenic Chattooga River. Perfect for trout fishing getaways.	(706) 555-0703	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
52	Kona Coast Fishing Resort	resort	Hawaii	HI	Kailua-Kona	$$$$	349	699	Oceanfront on Kona Coast	{Pool,Restaurant,"Charter Desk",Spa,WiFi,Snorkeling,Luau,"Ocean View"}	https://booking.com	4.8	145	Luxury oceanfront resort on the Kona Coast with in-house charter fishing desk. World-class marlin fishing at your doorstep.	(808) 555-0801	f	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
53	Wahiawa Lakeside Cottage	cabin	Hawaii	HI	Wahiawa	$$	129	199	0.5 miles from Wahiawa Reservoir	{Kitchen,Lanai,WiFi,Parking,Garden,BBQ}	https://booking.com	4.3	28	Charming Hawaiian cottage near Wahiawa Reservoir. Fish for peacock bass and enjoy tropical garden views.	(808) 555-0802	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
54	Big Island Beach Bungalow	cabin	Hawaii	HI	Kailua-Kona	$$$	199	379	Beachfront	{Kitchen,"Ocean View","Snorkeling Gear",WiFi,Hammock,"Outdoor Shower"}	https://booking.com	4.6	67	Private beachfront bungalow on the Big Island. Shore fish for trevally or book offshore charters for marlin.	(808) 555-0803	f	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
55	Snake River Lodge	lodge	Idaho	ID	Twin Falls	$$$	159	279	On the Snake River	{"Guide Service","Fly Shop",Restaurant,WiFi,"Boat Dock","Fish Cleaning Station"}	https://booking.com	4.6	89	Premier fishing lodge on the Snake River with expert guides for trout and steelhead. All-inclusive packages available.	(208) 555-0901	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
56	Coeur d'Alene Lakefront Hotel	hotel	Idaho	ID	Coeur d'Alene	$$$	179	329	On Lake Coeur d'Alene	{WiFi,Pool,Spa,Restaurant,Marina,"Boat Rentals",Golf}	https://booking.com	4.7	167	Elegant lakefront hotel on one of America's most beautiful lakes. Fish for chinook salmon and trophy pike.	(208) 555-0902	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
57	Henry's Fork Riverside Cabins	cabin	Idaho	ID	Island Park	$$	109	189	On Henry's Fork River	{Kitchen,Porch,WiFi,"Fly Tying Bench","Wader Storage","Fire Pit"}	https://booking.com	4.5	72	Cozy cabins on the legendary Henry's Fork. Walk to some of the best dry fly fishing in the world.	(208) 555-0903	t	t	May	October	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
58	Chicago Lakefront Hotel	hotel	Illinois	IL	Chicago	$$$	189	349	0.25 miles from Lake Michigan	{WiFi,Restaurant,"Fitness Center",Concierge,"Valet Parking","Lake Views"}	https://booking.com	4.4	234	Downtown Chicago hotel with Lake Michigan views. Easy access to charter fishing and harbor perch fishing.	(312) 555-1001	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
59	Rend Lake Resort	resort	Illinois	IL	Benton	$$	99	179	On Rend Lake	{Golf,Pool,Restaurant,Marina,"Boat Rentals",WiFi,Tennis}	https://booking.com	4.3	87	Full-service resort on Rend Lake with marina and boat rentals. Outstanding crappie and bass fishing.	(618) 555-1002	t	f	\N	\N	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
60	Rend Lake Campground	campground	Illinois	IL	Benton	$	20	40	On Rend Lake	{"Boat Ramp","Electric Hookups",Restrooms,"Fire Pits",Playground,Beach}	https://booking.com	4.1	65	Lakeside campground with direct water access. Fish from shore or launch your boat at the nearby ramp.	(618) 555-1003	t	t	April	October	2026-03-23 20:33:46.582817+00	2026-03-23 20:33:46.582817+00
61	Patoka Lake Lodge	lodge	Indiana	IN	Birdseye	$$	109	189	0.5 miles from Patoka Lake	{Restaurant,Pool,WiFi,"Boat Rentals","Nature Trails","Meeting Room"}	https://booking.com	4.3	56	Comfortable lodge near Patoka Lake with boat rental desk and nature trails. Great base for multi-species fishing.	(812) 555-1101	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
62	Wabash River Campground	campground	Indiana	IN	Lafayette	$	18	35	On the Wabash River	{"Boat Ramp","Fire Pits",Restrooms,"Picnic Shelters",Playground}	https://booking.com	4.0	38	Riverside campground on Indiana's state river. Wade fish for smallmouth bass right from camp.	(765) 555-1102	t	t	April	October	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
63	Indianapolis Angler Suites	hotel	Indiana	IN	Indianapolis	$$	89	149	15 miles from Eagle Creek Reservoir	{WiFi,Breakfast,Pool,Parking,"Fitness Center",Laundry}	https://booking.com	4.1	42	Comfortable suites with easy access to central Indiana fishing destinations. Oversized parking for boats.	(317) 555-1103	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
64	Spirit Lake Fishing Resort	resort	Iowa	IA	Spirit Lake	$$	119	209	On Spirit Lake	{Marina,"Boat Rentals","Fish Cleaning Station",WiFi,Restaurant,"Bait Shop"}	https://booking.com	4.5	98	Lakefront resort on Iowa's largest natural lake. Rent a boat and fish for walleye and muskie all day.	(712) 555-1201	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
65	Mississippi River Bluff Cabins	cabin	Iowa	IA	Lansing	$$	95	165	Overlooking Mississippi River	{Kitchen,Deck,WiFi,Grill,"River Views",Parking}	https://booking.com	4.4	51	Blufftop cabins with stunning Mississippi River views. Fish the backwaters for walleye, bass, and bluegill.	(563) 555-1202	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
66	Okoboji Lake Campground	campground	Iowa	IA	Arnolds Park	$	25	45	On West Okoboji Lake	{"Boat Ramp",Beach,"Fire Pits",Showers,"Electric Hookups","Camp Store"}	https://booking.com	4.3	76	Popular campground on beautiful West Okoboji Lake. Excellent walleye and perch fishing.	(712) 555-1203	t	t	May	September	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
67	Milford Lake Resort	resort	Kansas	KS	Junction City	$$	99	179	On Milford Reservoir	{Marina,Pool,Restaurant,"Boat Rentals",WiFi,Playground}	https://booking.com	4.2	63	Family-friendly resort on Kansas' largest lake. Fish for walleye, stripers, and white bass.	(785) 555-1301	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
68	Flint Hills Fishing Cabins	cabin	Kansas	KS	Emporia	$	65	110	0.5 miles from Flint Hills Pay Lake	{Kitchen,Porch,"Fire Pit",Parking,Grill}	https://booking.com	4.0	27	Simple but comfortable cabins near the Flint Hills. Perfect for a weekend catfish trip.	(620) 555-1302	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
69	Council Grove Lake Campground	campground	Kansas	KS	Council Grove	$	15	30	On Council Grove Lake	{"Boat Ramp",Restrooms,"Fire Pits","Picnic Tables","Hiking Trails"}	https://booking.com	4.1	34	Corps of Engineers campground on a scenic Kansas lake. Good crappie and catfish fishing.	(620) 555-1303	t	t	April	October	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
70	Kentucky Lake Fishing Lodge	lodge	Kentucky	KY	Gilbertsville	$$$	149	269	On Kentucky Lake	{"Guide Service","Boat Dock","Fish Cleaning Station",Restaurant,WiFi,"Bait Shop"}	https://booking.com	4.7	134	Premier crappie fishing lodge on Kentucky Lake. Spider rigging guides and all-inclusive packages available.	(270) 555-1401	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
71	Dale Hollow Lakeside Cabins	cabin	Kentucky	KY	Burkesville	$$	109	189	On Dale Hollow Lake	{Kitchen,Dock,"Fish Cleaning Station",WiFi,Porch,Grill,"Boat Ramp"}	https://booking.com	4.6	78	Lakeside cabins on crystal-clear Dale Hollow Lake. Home of the world record smallmouth bass.	(270) 555-1402	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
93	Las Vegas Angler Hotel	hotel	Nevada	NV	Las Vegas	$$$	149	279	30 miles from Lake Mead	{WiFi,Pool,Casino,Restaurant,Spa,Concierge,"Shuttle Service"}	https://booking.com	4.2	89	Stay in Vegas and fish Lake Mead. Shuttle service to the lake and guide booking assistance.	(702) 555-2103	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
72	Land Between the Lakes Campground	campground	Kentucky	KY	Grand Rivers	$	22	40	Between Kentucky Lake and Lake Barkley	{"Boat Ramp",Restrooms,"Fire Pits","Hiking Trails","Wildlife Viewing","Electric Hookups"}	https://booking.com	4.4	92	Camp in the heart of Land Between the Lakes with access to two world-class fishing lakes.	(270) 555-1403	t	t	March	November	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
73	Moosehead Lake Wilderness Lodge	lodge	Maine	ME	Greenville	$$$	179	329	On Moosehead Lake	{"Guide Service","Boat Dock",Restaurant,WiFi,"Canoe Rentals","Fly Shop",Sauna}	https://booking.com	4.7	89	Authentic Maine sporting lodge on Moosehead Lake. Fish for landlocked salmon and brook trout in pristine wilderness.	(207) 555-1501	f	t	May	October	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
74	Kennebec River Cabins	cabin	Maine	ME	Augusta	$$	99	175	On the Kennebec River	{Kitchen,Canoe,WiFi,"Fire Pit",Porch,Parking}	https://booking.com	4.4	52	Riverside cabins on the historic Kennebec River. Fish for stripers, salmon, and smallmouth bass.	(207) 555-1502	t	f	\N	\N	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
75	Baxter State Park Campground	campground	Maine	ME	Millinocket	$	25	40	Near multiple trout ponds	{"Fire Pits",Restrooms,"Canoe Rentals","Hiking Trails","Wildlife Viewing"}	https://booking.com	4.6	67	Remote wilderness camping near some of Maine's best brook trout ponds. True backcountry experience.	(207) 555-1503	f	t	May	October	2026-03-23 20:34:19.6526+00	2026-03-23 20:34:19.6526+00
76	Chesapeake Bay Waterfront Inn	hotel	Maryland	MD	Annapolis	$$$	179	329	On Chesapeake Bay	{WiFi,Restaurant,Marina,Pool,"Charter Desk","Crab Feast Packages"}	https://booking.com	4.6	156	Historic waterfront inn on the Chesapeake Bay. Charter striped bass trips and enjoy fresh crab feasts.	(410) 555-1601	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
77	Deep Creek Lake Cabin Resort	cabin	Maryland	MD	McHenry	$$$	159	289	On Deep Creek Lake	{Kitchen,"Hot Tub",Dock,"Boat Rentals",WiFi,Fireplace,"Game Room"}	https://booking.com	4.5	98	Luxury lakeside cabins on Deep Creek Lake with private docks. Fish for walleye, bass, and pike.	(301) 555-1602	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
78	Assateague Island Campground	campground	Maryland	MD	Berlin	$	25	45	Oceanfront	{"Beach Access",Restrooms,"Fire Pits","Surf Fishing","Wildlife Viewing"}	https://booking.com	4.3	112	Camp on the beach at Assateague Island. Surf fish for stripers and bluefish with wild ponies nearby.	(410) 555-1603	f	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
79	Cape Cod Fishing Lodge	lodge	Massachusetts	MA	Provincetown	$$$	199	379	On Cape Cod Bay	{"Charter Desk",Restaurant,WiFi,Parking,"Fish Cleaning Station","Tackle Shop"}	https://booking.com	4.5	87	Premier fishing lodge on Cape Cod with in-house charter services. Striper, tuna, and cod fishing.	(508) 555-1701	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
80	Quabbin Reservoir Inn	hotel	Massachusetts	MA	Belchertown	$$	109	179	2 miles from Quabbin Reservoir	{WiFi,Breakfast,Parking,"Boat Trailer Parking",Laundry}	https://booking.com	4.2	43	Comfortable inn near pristine Quabbin Reservoir. Fish for landlocked salmon and lake trout.	(413) 555-1702	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
81	Martha's Vineyard Beach Cottage	cabin	Massachusetts	MA	Edgartown	$$$$	299	549	Beachfront	{Kitchen,"Ocean View",Kayak,WiFi,Porch,"Outdoor Shower",Grill}	https://booking.com	4.7	65	Charming beachfront cottage on Martha's Vineyard. Surf cast for stripers and bluefish from your backyard.	(508) 555-1703	f	t	May	October	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
82	Ross Barnett Reservoir Lodge	lodge	Mississippi	MS	Brandon	$$	99	169	On Ross Barnett Reservoir	{"Boat Dock",Restaurant,WiFi,Pool,"Fish Cleaning Station","Bait Shop"}	https://booking.com	4.3	67	Lakeside lodge on the Rez with boat dock and guide services. Excellent bass and crappie fishing.	(601) 555-1801	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
83	Gulf Coast Beach Hotel	hotel	Mississippi	MS	Biloxi	$$	109	199	On Mississippi Gulf Coast	{WiFi,Pool,Restaurant,Casino,"Charter Desk","Beach Access"}	https://booking.com	4.4	134	Beachfront hotel on the Mississippi Gulf Coast. Book inshore charters for redfish and speckled trout.	(228) 555-1802	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
84	Delta Catfish Camp	campground	Mississippi	MS	Greenville	$	15	28	On the Mississippi River	{"Boat Ramp","Fire Pits",Restrooms,"Bait Shop","Fish Cleaning Station"}	https://booking.com	4.0	23	Rustic fish camp on the mighty Mississippi. Trophy catfish and bass fishing in the Delta.	(662) 555-1803	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
85	Lake of the Ozarks Resort	resort	Missouri	MO	Osage Beach	$$$	169	319	On Lake of the Ozarks	{Marina,Pool,Restaurant,"Water Park",WiFi,"Boat Rentals","Mini Golf"}	https://booking.com	4.4	187	Full-service lakefront resort with marina and boat rentals. Fish over 1,150 miles of shoreline.	(573) 555-1901	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
86	Table Rock Lake Cabins	cabin	Missouri	MO	Branson	$$	109	189	On Table Rock Lake	{Kitchen,Dock,"Fish Cleaning Station",WiFi,Porch,Grill,"Boat Ramp"}	https://booking.com	4.5	94	Cozy lakeside cabins on clear Table Rock Lake. Walk to your boat and fish for spotted bass and crappie.	(417) 555-1902	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
87	Branson Trout Campground	campground	Missouri	MO	Branson	$	25	45	On Lake Taneycomo	{"Boat Ramp","Fish Cleaning Station","Electric Hookups",Restrooms,"Bait Shop"}	https://booking.com	4.2	56	Campground on Lake Taneycomo's cold tailwaters. Trout fishing right from your campsite.	(417) 555-1903	t	t	March	November	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
88	Lake McConaughy Beach Resort	resort	Nebraska	NE	Ogallala	$$	109	199	On Lake McConaughy	{Beach,Marina,"Boat Rentals",WiFi,Restaurant,Pool}	https://booking.com	4.3	78	Sandy beach resort on Nebraska's largest reservoir. Fish for walleye, white bass, and wipers.	(308) 555-2001	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
89	Calamus Reservoir Cabins	cabin	Nebraska	NE	Burwell	$	75	125	0.5 miles from Calamus Reservoir	{Kitchen,Porch,"Fire Pit",Parking,Grill}	https://booking.com	4.1	34	Simple lakeside cabins near Calamus Reservoir. Great walleye and pike fishing in the Sandhills.	(308) 555-2002	t	f	\N	\N	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
90	Sandhills Fishing Campground	campground	Nebraska	NE	Valentine	$	18	32	On the Niobrara River	{"Canoe Rentals","Fire Pits",Restrooms,Tubing,"Picnic Tables"}	https://booking.com	4.4	56	Riverside campground on the scenic Niobrara River. Canoe and fish for smallmouth and channel cats.	(402) 555-2003	t	t	May	September	2026-03-23 20:34:51.603373+00	2026-03-23 20:34:51.603373+00
91	Lake Mead Marina Resort	resort	Nevada	NV	Boulder City	$$$	169	299	On Lake Mead	{Marina,"Houseboat Rentals",Restaurant,Pool,WiFi,"Boat Rentals"}	https://booking.com	4.4	112	Desert oasis resort on Lake Mead with marina and houseboat rentals. Chase striped bass in dramatic canyons.	(702) 555-2101	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
94	Lake Winnipesaukee Grand Hotel	hotel	New Hampshire	NH	Laconia	$$$	179	329	On Lake Winnipesaukee	{WiFi,Restaurant,Marina,Pool,Spa,"Boat Rentals","Lake Views"}	https://booking.com	4.6	134	Grand lakefront hotel on New Hampshire's largest lake. Fish for salmon, lake trout, and bass.	(603) 555-2201	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
95	Connecticut River Wilderness Cabins	cabin	New Hampshire	NH	Pittsburg	$$	99	175	On the Connecticut River	{Kitchen,Canoe,"Fire Pit",WiFi,Porch,"Fly Tying Bench"}	https://booking.com	4.5	56	Remote cabins on the upper Connecticut River. Trophy trout fishing in pristine wilderness.	(603) 555-2202	t	t	May	October	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
96	White Mountains Fishing Camp	campground	New Hampshire	NH	Lincoln	$	28	48	Near Pemigewasset River	{"Fire Pits",Restrooms,Showers,"Hiking Trails","Camp Store"}	https://booking.com	4.3	67	Mountain campground near excellent trout streams in the White Mountains. Hike and fish all day.	(603) 555-2203	t	t	May	October	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
97	Barnegat Bay Marina Hotel	hotel	New Jersey	NJ	Barnegat Light	$$$	169	299	On Barnegat Bay	{WiFi,Restaurant,Marina,"Charter Desk",Pool,"Fish Cleaning Station"}	https://booking.com	4.4	98	Waterfront hotel at Barnegat Light with marina and charter fishing services. Striper and fluke capital.	(609) 555-2301	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
98	Round Valley Lakeside Cabin	cabin	New Jersey	NJ	Lebanon	$$	119	199	1 mile from Round Valley Reservoir	{Kitchen,WiFi,Porch,Grill,Parking,"Fire Pit"}	https://booking.com	4.3	41	Peaceful cabin retreat near Round Valley Reservoir. Fish for trophy lake trout and brown trout.	(908) 555-2302	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
99	Jersey Shore RV Resort	rv_park	New Jersey	NJ	Cape May	$$	55	95	0.5 miles from Delaware Bay	{"Full Hookups",Pool,WiFi,Laundry,Playground,"Fishing Pier"}	https://booking.com	4.2	76	Full-service RV resort near Cape May with fishing pier. Surf fish for stripers and blues.	(609) 555-2303	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
100	Elephant Butte Lake Resort	resort	New Mexico	NM	Truth or Consequences	$$	109	199	On Elephant Butte Lake	{Marina,Pool,Restaurant,"Boat Rentals",WiFi,"Hot Springs"}	https://booking.com	4.3	67	Desert lake resort with hot springs nearby. Fish for bass, stripers, and walleye on NM's largest lake.	(575) 555-2401	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
101	San Juan River Fly Lodge	lodge	New Mexico	NM	Navajo Dam	$$$	169	299	On the San Juan River	{"Guide Service","Fly Shop",Restaurant,WiFi,"Wader Storage","Tying Bench"}	https://booking.com	4.8	112	World-class fly fishing lodge on the San Juan River. Expert guides and trophy trout averaging 18 inches.	(505) 555-2402	f	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
102	Navajo Lake Campground	campground	New Mexico	NM	Navajo Dam	$	20	38	On Navajo Lake	{"Boat Ramp",Restrooms,"Fire Pits","Picnic Tables","Hiking Trails"}	https://booking.com	4.2	45	Scenic campground on Navajo Lake with easy access to both the lake and San Juan River tailwater.	(505) 555-2403	t	t	April	October	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
103	Lake Sakakawea Lodge	lodge	North Dakota	ND	Garrison	$$	99	179	On Lake Sakakawea	{"Guide Service","Boat Dock","Fish Cleaning Station",WiFi,Restaurant,"Bait Shop"}	https://booking.com	4.5	78	Fishing lodge on massive Lake Sakakawea. Walleye guides and all-inclusive packages available.	(701) 555-2501	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
104	Devils Lake Fishing Resort	resort	North Dakota	ND	Devils Lake	$$	109	199	On Devils Lake	{Marina,"Boat Rentals","Fish Cleaning Station",WiFi,Restaurant,"Ice House Rentals"}	https://booking.com	4.6	112	Year-round fishing resort on Devils Lake. Summer walleye and winter ice fishing packages.	(701) 555-2502	t	f	\N	\N	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
105	Missouri River Campground	campground	North Dakota	ND	Bismarck	$	18	35	On the Missouri River	{"Boat Ramp","Fire Pits",Restrooms,"Picnic Tables","Electric Hookups"}	https://booking.com	4.1	34	Riverside campground on the Missouri River. Fish for walleye, catfish, and northern pike.	(701) 555-2503	t	t	May	September	2026-03-23 20:35:21.335268+00	2026-03-23 20:35:21.335268+00
106	Lake Erie Charter Hotel	hotel	Ohio	OH	Cleveland	$$$	149	269	0.5 miles from Lake Erie	{WiFi,Restaurant,"Charter Desk",Pool,"Fitness Center",Parking}	https://booking.com	4.4	145	Downtown Cleveland hotel with Lake Erie charter fishing desk. Walk to the harbor for walleye and perch trips.	(216) 555-2601	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
107	Ohio River Fishing Cabins	cabin	Ohio	OH	Cincinnati	$$	89	159	On the Ohio River	{Kitchen,Porch,WiFi,Parking,Grill,"River Views"}	https://booking.com	4.2	52	Riverside cabins overlooking the Ohio River. Fish for sauger and catfish below the dams.	(513) 555-2602	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
108	Put-in-Bay Island Lodge	lodge	Ohio	OH	Put-in-Bay	$$$	169	299	On Lake Erie	{Marina,Restaurant,WiFi,"Charter Service",Pool,"Bike Rentals"}	https://booking.com	4.6	89	Island lodge on Lake Erie with world-class walleye fishing. Ferry access and charter boats available.	(419) 555-2603	t	t	May	October	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
109	Grand Lake Resort	resort	Oklahoma	OK	Grove	$$$	149	269	On Grand Lake	{Marina,Pool,Restaurant,Golf,WiFi,"Boat Rentals","Water Sports"}	https://booking.com	4.4	134	Full-service resort on Grand Lake with marina. Fish for bass, crappie, and paddlefish.	(918) 555-2701	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
110	Broken Bow Lake Cabins	cabin	Oklahoma	OK	Broken Bow	$$$	159	289	On Broken Bow Lake	{Kitchen,"Hot Tub",Fireplace,WiFi,Deck,Grill,"Lake Views"}	https://booking.com	4.7	167	Luxury mountain cabins on crystal-clear Broken Bow Lake. Trophy smallmouth and trout in the tailwater.	(580) 555-2702	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
111	Lake Texoma RV Park	rv_park	Oklahoma	OK	Kingston	$	35	60	On Lake Texoma	{"Full Hookups","Boat Ramp","Fish Cleaning Station",WiFi,Laundry,"Camp Store"}	https://booking.com	4.2	56	Lakeside RV park on Lake Texoma with boat ramp. Famous for naturally reproducing striped bass.	(580) 555-2703	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
112	Lake Erie Steelhead Lodge	lodge	Pennsylvania	PA	Erie	$$$	149	259	1 mile from Elk Creek	{"Guide Service","Fly Shop",WiFi,"Wader Storage","Fish Cleaning Station",Breakfast}	https://booking.com	4.6	98	Premier steelhead lodge near Erie's famous tributaries. Guided trips October through April.	(814) 555-2801	t	t	September	April	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
113	Delaware River Inn	hotel	Pennsylvania	PA	Philadelphia	$$	119	209	0.5 miles from Delaware River	{WiFi,Restaurant,Parking,"Fitness Center",Concierge}	https://booking.com	4.3	87	Comfortable hotel near the Delaware River. Fish the famous shad run in spring.	(215) 555-2802	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
114	Pocono Mountains Fishing Cabin	cabin	Pennsylvania	PA	Hawley	$$	109	189	On Lake Wallenpaupack	{Kitchen,Fireplace,Dock,WiFi,"Hot Tub",Grill}	https://booking.com	4.5	67	Lakeside cabin on Lake Wallenpaupack in the Poconos. Fish for walleye, bass, and trout.	(570) 555-2803	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
115	Block Island Fishing Inn	hotel	Rhode Island	RI	New Shoreham	$$$	199	369	On Block Island	{WiFi,Restaurant,"Charter Desk","Bike Rentals","Ocean Views","Beach Access"}	https://booking.com	4.5	67	Charming island inn with charter fishing services. World-class striper fishing at the Southwest Ledge.	(401) 555-2901	f	t	May	October	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
116	Narragansett Bay Marina Hotel	hotel	Rhode Island	RI	Warwick	$$	129	219	On Narragansett Bay	{WiFi,Restaurant,Marina,Pool,Parking,"Charter Desk"}	https://booking.com	4.3	78	Waterfront hotel on Narragansett Bay with marina access. Fish for stripers, tautog, and scup.	(401) 555-2902	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
117	Watch Hill Beach Cottage	cabin	Rhode Island	RI	Westerly	$$$$	279	499	Beachfront	{Kitchen,"Ocean View",WiFi,Porch,"Outdoor Shower",Kayak}	https://booking.com	4.7	45	Luxury beachfront cottage at Watch Hill. Surf cast for stripers and bluefish from your doorstep.	(401) 555-2903	f	t	June	September	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
118	Lake Murray Fishing Resort	resort	South Carolina	SC	Irmo	$$$	149	269	On Lake Murray	{Marina,Pool,Restaurant,"Boat Rentals",WiFi,Golf,Tennis}	https://booking.com	4.4	112	Lakefront resort on Lake Murray with marina and guide services. Excellent striper and bass fishing.	(803) 555-3001	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
119	Charleston Harbor Inn	hotel	South Carolina	SC	Charleston	$$$	189	349	On Charleston Harbor	{WiFi,Restaurant,Pool,"Charter Desk","Valet Parking","Rooftop Bar"}	https://booking.com	4.6	198	Historic waterfront hotel in Charleston with inshore fishing charters. Sight fish for redfish on the flats.	(843) 555-3002	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
120	Santee Cooper Fish Camp	campground	South Carolina	SC	Santee	$	22	40	On Lake Marion	{"Boat Ramp","Fish Cleaning Station","Fire Pits",Restrooms,"Bait Shop","Electric Hookups"}	https://booking.com	4.2	67	Classic Southern fish camp on Lake Marion. Trophy catfish and excellent crappie fishing.	(803) 555-3003	t	f	\N	\N	2026-03-23 20:35:52.586106+00	2026-03-23 20:35:52.586106+00
121	Lake Oahe Fishing Lodge	lodge	South Dakota	SD	Pierre	$$$	149	269	On Lake Oahe	{"Guide Service","Boat Dock","Fish Cleaning Station",WiFi,Restaurant,"Bait Shop"}	https://booking.com	4.6	89	Premier walleye lodge on Lake Oahe with expert guides. All-inclusive fishing packages available.	(605) 555-3101	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
122	Chamberlain River Cabins	cabin	South Dakota	SD	Chamberlain	$$	89	159	On the Missouri River	{Kitchen,Porch,WiFi,"Fish Cleaning Station",Parking,Grill}	https://booking.com	4.3	52	Riverside cabins overlooking the Missouri River at Chamberlain. Walleye and catfish fishing.	(605) 555-3102	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
123	Black Hills Trout Campground	campground	South Dakota	SD	Rapid City	$	22	40	On Rapid Creek	{"Fire Pits",Restrooms,"Hiking Trails","Fly Fishing Access","Picnic Tables"}	https://booking.com	4.4	45	Mountain campground near Black Hills trout streams. Fish Rapid Creek for brown and rainbow trout.	(605) 555-3103	t	t	May	October	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
124	Norris Lake Resort	resort	Tennessee	TN	Rocky Top	$$$	149	279	On Norris Lake	{Marina,Pool,Restaurant,"Boat Rentals",WiFi,"Water Sports","Fish Cleaning Station"}	https://booking.com	4.5	134	Full-service resort on crystal-clear Norris Lake. Fish for stripers, walleye, and smallmouth bass.	(865) 555-3201	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
125	Reelfoot Lake Cypress Lodge	lodge	Tennessee	TN	Tiptonville	$$	89	159	On Reelfoot Lake	{"Guide Service","Boat Dock",Restaurant,WiFi,"Bait Shop","Eagle Tours"}	https://booking.com	4.6	98	Historic lodge on earthquake-formed Reelfoot Lake. World-famous crappie fishing among cypress trees.	(731) 555-3202	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
126	Great Smoky Mountains Fishing Cabin	cabin	Tennessee	TN	Gatlinburg	$$$	159	289	2 miles from Little River	{Kitchen,"Hot Tub",Fireplace,WiFi,Porch,"Mountain Views",Grill}	https://booking.com	4.7	167	Mountain cabin near Great Smoky Mountains trout streams. Fish for wild brook and rainbow trout.	(865) 555-3203	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
127	Lake Powell Luxury Resort	resort	Utah	UT	Bullfrog	$$$	199	399	On Lake Powell	{Marina,"Houseboat Rentals",Restaurant,Pool,WiFi,"Boat Rentals",Kayaks}	https://booking.com	4.5	112	Desert resort on Lake Powell with marina and houseboat rentals. Fish stunning red-rock canyons.	(435) 555-3301	t	t	March	November	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
128	Green River Fly Fishing Lodge	lodge	Utah	UT	Dutch John	$$$	179	319	On the Green River	{"Guide Service","Fly Shop",Restaurant,WiFi,"Drift Boat Trips","Wader Storage"}	https://booking.com	4.8	134	World-class fly fishing lodge below Flaming Gorge Dam. Trophy trout on the legendary Green River.	(435) 555-3302	f	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
129	Flaming Gorge Campground	campground	Utah	UT	Manila	$	22	40	On Flaming Gorge Reservoir	{"Boat Ramp",Restrooms,"Fire Pits","Hiking Trails","Scenic Views"}	https://booking.com	4.4	67	Scenic campground on Flaming Gorge with stunning red-rock views. Lake trout and kokanee fishing.	(435) 555-3303	t	t	May	October	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
130	Lake Champlain Waterfront Hotel	hotel	Vermont	VT	Burlington	$$$	179	329	On Lake Champlain	{WiFi,Restaurant,Marina,Pool,Spa,"Lake Views","Bike Rentals"}	https://booking.com	4.6	145	Elegant lakefront hotel on Lake Champlain with marina access. Fish for salmon, pike, and bass.	(802) 555-3401	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
131	Battenkill River Inn	hotel	Vermont	VT	Manchester	$$	119	209	0.25 miles from Battenkill River	{WiFi,Breakfast,"Fly Shop",Parking,Garden,Library}	https://booking.com	4.5	67	Classic Vermont inn near the legendary Battenkill River. Walk to wild brown trout water.	(802) 555-3402	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
132	Green Mountain Fishing Camp	campground	Vermont	VT	Stowe	$	25	45	Near Waterbury Reservoir	{"Fire Pits",Restrooms,"Canoe Rentals","Hiking Trails",Swimming}	https://booking.com	4.3	45	Mountain campground near excellent Vermont trout streams and Waterbury Reservoir.	(802) 555-3403	t	t	May	October	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
133	James River Fishing Lodge	lodge	Virginia	VA	Richmond	$$$	149	269	On the James River	{"Guide Service","Kayak Rentals",WiFi,Restaurant,"Fish Cleaning Station",Parking}	https://booking.com	4.5	89	Urban fishing lodge on the James River in Richmond. Guided smallmouth trips through the city.	(804) 555-3501	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
134	Smith Mountain Lake Cabins	cabin	Virginia	VA	Moneta	$$$	159	289	On Smith Mountain Lake	{Kitchen,Dock,"Hot Tub",WiFi,Porch,Grill,"Boat Ramp"}	https://booking.com	4.6	112	Lakeside cabins on Virginia's most popular lake. Fish for stripers, muskie, and bass.	(540) 555-3502	t	f	\N	\N	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
135	Shenandoah Valley Campground	campground	Virginia	VA	Luray	$	25	45	On the Shenandoah River	{"Canoe Rentals","Fire Pits",Restrooms,Tubing,"Hiking Trails",Swimming}	https://booking.com	4.3	78	Riverside campground on the Shenandoah River. Canoe and fish for smallmouth bass.	(540) 555-3503	t	t	April	October	2026-03-23 20:36:23.055889+00	2026-03-23 20:36:23.055889+00
136	Puget Sound Waterfront Hotel	hotel	Washington	WA	Seattle	$$$	199	369	On Puget Sound	{WiFi,Restaurant,"Charter Desk",Pool,Spa,"Waterfront Dining",Concierge}	https://booking.com	4.5	178	Waterfront hotel on Puget Sound with salmon charter desk. Fish for chinook, coho, and halibut.	(206) 555-3601	t	f	\N	\N	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
137	Columbia River Fishing Lodge	lodge	Washington	WA	Astoria	$$$	149	269	On the Columbia River	{"Guide Service","Boat Dock","Fish Cleaning Station",WiFi,Restaurant,"Tackle Shop"}	https://booking.com	4.6	112	Premier salmon and sturgeon lodge on the mighty Columbia River. Expert guides for trophy fish.	(360) 555-3602	t	f	\N	\N	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
138	Olympic Peninsula Campground	campground	Washington	WA	Forks	$	22	40	On the Hoh River	{"Fire Pits",Restrooms,"Hiking Trails","Boat Ramp","Wildlife Viewing"}	https://booking.com	4.4	67	Rainforest campground on the Hoh River. Fish for steelhead and salmon in pristine wilderness.	(360) 555-3603	t	t	April	November	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
139	New River Gorge Lodge	lodge	West Virginia	WV	Fayetteville	$$$	139	249	On the New River	{"Guide Service","Raft Trips",WiFi,Restaurant,"Kayak Rentals",Hiking}	https://booking.com	4.6	98	Adventure lodge on the New River with fishing and rafting. Smallmouth bass and muskie fishing.	(304) 555-3701	t	f	\N	\N	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
140	Summersville Lake Cabins	cabin	West Virginia	WV	Summersville	$$	99	179	On Summersville Lake	{Kitchen,Dock,WiFi,Porch,Grill,"Kayak Rentals"}	https://booking.com	4.5	67	Lakeside cabins on crystal-clear Summersville Lake. Exceptional smallmouth bass fishing.	(304) 555-3702	t	f	\N	\N	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
141	Greenbrier River Campground	campground	West Virginia	WV	Marlinton	$	18	35	On the Greenbrier River	{"Canoe Rentals","Fire Pits",Restrooms,"Rail Trail Access",Swimming}	https://booking.com	4.3	45	Riverside campground on the scenic Greenbrier River. Canoe and fish for smallmouth and trout.	(304) 555-3703	t	t	April	October	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
142	Yellowstone River Lodge	lodge	Wyoming	WY	Livingston	$$$$	249	449	On the Yellowstone River	{"Guide Service","Fly Shop","Gourmet Restaurant",WiFi,"Hot Tub","Drift Boat Trips"}	https://booking.com	4.8	134	Luxury fly fishing lodge on the Yellowstone River. Expert guides and gourmet dining in Paradise Valley.	(406) 555-3801	f	t	May	October	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
143	Flaming Gorge Lake Resort	resort	Wyoming	WY	Green River	$$$	139	249	On Flaming Gorge Reservoir	{Marina,"Boat Rentals",Restaurant,WiFi,Pool,"Fishing Charters"}	https://booking.com	4.5	89	Lakeside resort on Flaming Gorge with marina. Fish for trophy lake trout and kokanee salmon.	(307) 555-3802	t	f	\N	\N	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
144	North Platte River Cabins	cabin	Wyoming	WY	Casper	$$	99	179	On the North Platte River	{Kitchen,Porch,WiFi,"Fly Tying Bench","Wader Storage","Fire Pit"}	https://booking.com	4.4	56	Riverside cabins on the North Platte River. Fish the famous Miracle Mile for trophy trout.	(307) 555-3803	t	t	May	October	2026-03-23 20:36:44.450195+00	2026-03-23 20:36:44.450195+00
145	Resurrection Bay Fishing Charters & Inn	hotel	Alaska	AK	Seward	$$$	179	329	On Resurrection Bay	{"Charter Desk",WiFi,Restaurant,"Fish Processing",Parking,"Ocean Views"}	https://booking.com	4.7	112	Waterfront inn in Seward with halibut and salmon charter services. Fish processing and shipping included.	(907) 555-0104	t	t	May	September	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
146	Bristol Bay Fly-In Lodge	lodge	Alaska	AK	Dillingham	$$$$	1200	2500	On remote salmon rivers	{"Float Plane","Guide Service","Gourmet Meals","Fly Shop",Sauna,"Wildlife Viewing"}	https://booking.com	4.9	67	Ultimate Alaska fly-in fishing experience. Remote wilderness lodge with world-class salmon and trout.	(907) 555-0105	f	t	June	September	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
147	South Platte Canyon Cabins	cabin	Colorado	CO	Deckers	$$	119	199	On the South Platte River	{Kitchen,Porch,WiFi,"Fly Tying Bench","Fire Pit","Private River Access"}	https://booking.com	4.6	78	Secluded cabins in the South Platte Canyon with private river access. Technical trout fishing paradise.	(303) 555-0104	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
148	Blue Mesa Lakeside Campground	campground	Colorado	CO	Gunnison	$	25	45	On Blue Mesa Reservoir	{"Boat Ramp","Fire Pits",Restrooms,"Hiking Trails","Scenic Views","Electric Hookups"}	https://booking.com	4.3	56	Scenic campground on Colorado's largest body of water. Kokanee and lake trout fishing.	(970) 555-0105	t	t	May	October	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
149	Florida Keys Fishing Resort	resort	Florida	FL	Islamorada	$$$$	299	549	Oceanfront in the Keys	{Marina,"Guide Service",Pool,Restaurant,"Tiki Bar",WiFi,Kayaks,"Dive Shop"}	https://booking.com	4.8	234	Premier sportfishing resort in Islamorada, the Sport Fishing Capital of the World. Tarpon, bonefish, and permit.	(305) 555-0104	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
150	St. Johns River Fish Camp	campground	Florida	FL	Palatka	$	20	38	On the St. Johns River	{"Boat Ramp","Fish Cleaning Station","Fire Pits",Restrooms,"Bait Shop"}	https://booking.com	4.2	56	Old Florida fish camp on the St. Johns River. Bass, crappie, and shad fishing right from camp.	(386) 555-0105	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
151	Venice Fishing Lodge	lodge	Louisiana	LA	Venice	$$$	179	329	At the mouth of the Mississippi	{"Guide Service","Boat Dock","Fish Cleaning Station",Restaurant,WiFi,"Tackle Shop"}	https://booking.com	4.7	145	Premier fishing lodge at Venice, Louisiana. World-class redfish, tuna, and offshore fishing.	(504) 555-0104	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
152	Toledo Bend Lakeside Cabins	cabin	Louisiana	LA	Many	$$	89	159	On Toledo Bend Reservoir	{Kitchen,Dock,"Fish Cleaning Station",WiFi,Porch,Grill}	https://booking.com	4.4	78	Lakeside cabins on legendary Toledo Bend. Trophy largemouth bass fishing at your doorstep.	(318) 555-0105	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
153	Au Sable River Lodge	lodge	Michigan	MI	Grayling	$$$	149	269	On the Au Sable River	{"Guide Service","Fly Shop",Restaurant,WiFi,"Canoe Rentals","Tying Bench"}	https://booking.com	4.7	98	Historic fly fishing lodge on Michigan's most famous trout stream. Fish the legendary hex hatch.	(989) 555-0104	t	t	April	November	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
154	Lake St. Clair Marina Hotel	hotel	Michigan	MI	Harrison Township	$$$	149	269	On Lake St. Clair	{WiFi,Marina,Restaurant,"Charter Desk",Pool,"Fish Cleaning Station"}	https://booking.com	4.5	112	Marina hotel on world-class Lake St. Clair. Smallmouth bass, muskie, and walleye fishing.	(586) 555-0105	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
7	Sam Rayburn Campground	campground	Texas	TX	Jasper	$	20	45	0.1 miles	{"Boat Ramp","Fire Pits",Restrooms,Showers}	https://www.recreation.gov	0.0	0	Army Corps campground on Sam Rayburn Reservoir.	(409) 555-0156	t	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
155	Boundary Waters Outfitter Lodge	lodge	Minnesota	MN	Ely	$$$	149	269	Gateway to Boundary Waters	{"Canoe Outfitting","Guide Service",WiFi,Restaurant,Sauna,"Gear Rentals"}	https://booking.com	4.7	134	Full-service outfitter lodge at the gateway to the Boundary Waters. Canoe trip planning and fishing guides.	(218) 555-0104	t	t	May	October	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
156	Rainy Lake Fishing Resort	resort	Minnesota	MN	International Falls	$$	119	209	On Rainy Lake	{Marina,"Boat Rentals","Fish Cleaning Station",WiFi,Restaurant,"Ice House Rentals"}	https://booking.com	4.5	89	Year-round fishing resort on Rainy Lake. Summer walleye and winter ice fishing paradise.	(218) 555-0105	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
157	Fort Peck Reservoir Lodge	lodge	Montana	MT	Glasgow	$$	99	179	On Fort Peck Reservoir	{"Guide Service","Boat Dock","Fish Cleaning Station",WiFi,Restaurant}	https://booking.com	4.4	56	Fishing lodge on massive Fort Peck Reservoir. Walleye, pike, and lake trout fishing.	(406) 555-0104	t	f	\N	\N	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
158	Paradise Valley Fly Fishing Cabins	cabin	Montana	MT	Livingston	$$$	159	279	On the Yellowstone River	{Kitchen,Porch,WiFi,"Fly Tying Bench","Hot Tub","Mountain Views"}	https://booking.com	4.7	89	Riverside cabins in Paradise Valley on the Yellowstone River. World-class cutthroat trout fishing.	(406) 555-0105	t	t	May	October	2026-03-23 20:37:15.236381+00	2026-03-23 20:37:15.236381+00
159	Salmon River Steelhead Lodge	lodge	New York	NY	Pulaski	$$$	149	269	On the Salmon River	{"Guide Service","Fly Shop",WiFi,"Fish Cleaning Station",Breakfast,"Wader Storage"}	https://booking.com	4.6	112	Premier steelhead and salmon lodge on New York's Salmon River. Expert guides for fall salmon runs.	(315) 555-0104	t	t	September	April	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
160	Finger Lakes Wine & Fish Inn	hotel	New York	NY	Geneva	$$	119	209	On Seneca Lake	{WiFi,Restaurant,"Wine Tasting",Parking,"Lake Views","Boat Rentals"}	https://booking.com	4.4	87	Lakeside inn on Seneca Lake combining wine country charm with excellent trout fishing.	(315) 555-0105	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
161	Outer Banks Surf Fishing Lodge	lodge	North Carolina	NC	Nags Head	$$$	169	299	Oceanfront on Outer Banks	{"Surf Fishing Gear","Guide Service",WiFi,Restaurant,"Beach Access","Fish Cleaning Station"}	https://booking.com	4.5	98	Oceanfront lodge on the Outer Banks with surf fishing guides. Red drum, bluefish, and offshore charters.	(252) 555-0104	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
162	Lake Norman Lakeside Resort	resort	North Carolina	NC	Mooresville	$$$	159	289	On Lake Norman	{Marina,Pool,Restaurant,"Boat Rentals",WiFi,Golf,Spa}	https://booking.com	4.4	145	Full-service resort on Lake Norman near Charlotte. Striper and largemouth bass fishing.	(704) 555-0105	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
163	Deschutes River Fly Camp	campground	Oregon	OR	Maupin	$	25	45	On the Deschutes River	{"Fire Pits",Restrooms,"Boat Ramp","Hiking Trails","River Access"}	https://booking.com	4.4	67	Riverside campground on Oregon's premier fly fishing river. Steelhead and trout fishing.	(541) 555-0104	t	t	April	October	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
164	Tillamook Bay Charter Hotel	hotel	Oregon	OR	Garibaldi	$$	109	189	On Tillamook Bay	{WiFi,"Charter Desk","Fish Cleaning Station",Parking,Restaurant}	https://booking.com	4.3	56	Waterfront hotel on Tillamook Bay with salmon charter services. Crabbing and fishing packages.	(503) 555-0105	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
165	Lake Fork Trophy Bass Lodge	lodge	Texas	TX	Quitman	$$$	149	269	On Lake Fork	{"Guide Service","Boat Dock","Fish Cleaning Station",WiFi,Restaurant,"Tackle Shop"}	https://booking.com	4.7	156	Premier trophy bass lodge on Lake Fork. Expert guides targeting 10+ lb largemouth bass.	(903) 555-0104	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
166	Port Aransas Beach Resort	resort	Texas	TX	Port Aransas	$$$	169	319	Beachfront on Gulf of Mexico	{Pool,Restaurant,"Charter Desk",WiFi,"Beach Access","Tiki Bar","Kayak Rentals"}	https://booking.com	4.5	198	Beachfront resort on the Texas Gulf Coast. Deep sea fishing, wade fishing, and bay fishing charters.	(361) 555-0105	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
167	Lake Winnebago Fishing Resort	resort	Wisconsin	WI	Oshkosh	$$	109	199	On Lake Winnebago	{Marina,"Boat Rentals","Fish Cleaning Station",WiFi,Restaurant,"Ice Shanty Rentals"}	https://booking.com	4.4	98	Year-round resort on Wisconsin's largest inland lake. Walleye, sturgeon spearing, and perch fishing.	(920) 555-0104	t	f	\N	\N	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
168	Chippewa Flowage Wilderness Cabins	cabin	Wisconsin	WI	Hayward	$$$	139	249	On Chippewa Flowage	{Kitchen,Dock,Canoe,WiFi,"Fire Pit","Fish Cleaning Station",Grill}	https://booking.com	4.6	78	Wilderness cabins on the legendary Chippewa Flowage. Home of the former world record muskie.	(715) 555-0105	t	t	May	October	2026-03-23 20:37:37.300549+00	2026-03-23 20:37:37.300549+00
2	Everglades Fishing Lodge	lodge	Florida	FL	Everglades City	$$$	179	299	0.2 miles	{WiFi,Parking,"Guide Service","Tackle Shop"}	https://www.booking.com	0.0	0	Authentic Everglades lodge with expert fishing guides.	(239) 555-0198	t	f	\N	\N	2026-03-21 20:36:02.88499+00	2026-03-21 20:36:02.88499+00
3	Palm Beach Fishing Camp	campground	Florida	FL	Lake Okeechobee	$	25	55	0.1 miles	{"Boat Ramp","Fire Pits",Restrooms}	https://www.recreation.gov	0.0	0	Lakeside campground with excellent bass fishing access.	(863) 555-0167	t	f	\N	\N	2026-03-21 20:36:02.88499+00	2026-03-21 20:36:02.88499+00
4	Destin Harbor Suites	hotel	Florida	FL	Destin	$$$	199	379	0.3 miles	{WiFi,Pool,Breakfast,Parking}	https://www.hotels.com	0.0	0	Modern harbor-view hotel near Destin fishing fleet.	(850) 555-0234	f	f	\N	\N	2026-03-21 20:36:02.88499+00	2026-03-21 20:36:02.88499+00
5	Lake Fork Fishing Cabins	cabin	Texas	TX	Quitman	$$	119	189	Lakefront	{WiFi,Kitchen,"Boat Dock",Grill,Porch}	https://www.vrbo.com	0.0	0	Cozy lakefront cabins on Lake Fork, the #1 bass lake in Texas.	(903) 555-0145	t	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
6	Galveston Bay Resort	resort	Texas	TX	Galveston	$$$$	259	489	Marina Access	{WiFi,Pool,Marina,Restaurant,Spa}	https://www.booking.com	0.0	0	Full-service resort on Galveston Bay with fishing charters.	(409) 555-0178	f	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
8	Traverse City Lodge	lodge	Michigan	MI	Traverse City	$$$	189	329	0.5 miles	{WiFi,Restaurant,"Guide Service","Tackle Shop"}	https://www.booking.com	0.0	0	Premier Northern Michigan lodge with Grand Traverse Bay access.	(231) 555-0189	t	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
9	Au Sable River Cabins	cabin	Michigan	MI	Grayling	$$	99	169	Riverfront	{Kitchen,Fireplace,"Canoe Rental"}	https://www.vrbo.com	0.0	0	Charming riverfront cabins on the legendary Au Sable River.	(989) 555-0134	t	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
10	Lake Michigan RV Resort	rv_park	Michigan	MI	Ludington	$$	55	95	0.3 miles	{"Full Hookups",WiFi,Pool,Playground}	https://www.campspot.com	0.0	0	Family-friendly RV park near Lake Michigan.	(231) 555-0167	t	f	\N	\N	2026-03-21 20:36:12.614292+00	2026-03-21 20:36:12.614292+00
\.


--
-- Data for Name: lodging_reviews; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".lodging_reviews (id, lodging_id, user_id, user_display_name, rating, review_text, stay_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".profiles (id, email, display_name, created_at, updated_at, stripe_customer_id) FROM stdin;
794e9d40-ff0d-4137-bdf4-05482884016b	testuser6108@gmail.com	Sachin	2026-07-04 10:01:28.155155+00	2026-07-04 10:01:28.155155+00	\N
d2885019-5ae6-4e8b-be25-7436d5e515f4	nathannorth2005@gmail.com	Test	2026-07-23 23:16:14.700134+00	2026-07-23 23:16:14.700134+00	\N
e140c2fe-99d7-4eb9-9a67-f57a746e9e3f	sierraw91@yahoo.com	Sierra Williams	2026-08-08 23:54:13.32114+00	2026-08-08 23:54:13.32114+00	\N
853d59f9-851b-4db9-8320-29a6d161e45b	l87aa5p24g38b8vzwmu@icloud.com	Laurie Okura	2026-06-15 18:39:14.855813+00	2026-06-15 18:41:35.031+00	cus_Ui5duOQkT0F1NP
946ff1df-3a61-4e6e-a8f2-77e95ff413af	yhop24g38beqpz9ml79@icloud.com	Rosa	2026-06-21 13:51:22.196218+00	2026-06-21 13:51:22.196218+00	\N
92f998ff-fb7e-4af2-8820-3785e4a71cd6	isha131722@gmail.com	isha	2026-09-04 13:20:22.383166+00	2026-09-04 13:20:22.383166+00	\N
d1ac6a20-dfcd-46b1-9b36-8c731db5cb68	dktester812@gmail.com	Demo dk	2026-09-04 14:30:10.789177+00	2026-09-04 14:30:10.789177+00	\N
533dd482-8303-4a26-8e24-8b95c86d6a39	t7064732@gmail.com	Sachin test	2026-09-04 14:32:35.780355+00	2026-09-04 14:32:35.780355+00	\N
7725439b-2cfb-4c99-901e-1c4351d9d4c1	testuser052002@gmail.com	Sachin test	2026-09-05 04:40:31.874705+00	2026-09-05 04:40:31.874705+00	\N
70b91795-95a4-4490-a304-2e113b6e33cc	madangopal.redskyatech@gmail.com	Madan	2026-09-05 04:48:59.438075+00	2026-09-05 04:48:59.438075+00	\N
84d44021-6ab6-49ab-aefe-c9ea8ca7c3aa	testinguser200110@gmail.com	Test	2026-09-07 10:15:31.372057+00	2026-09-07 10:15:31.372057+00	\N
dcf38048-82c3-45d4-98fa-eacd2e81e8bf	Brilansie_transp@bellsouth.net	Admin	2026-10-10 05:50:37.699984+00	2026-10-10 05:50:37.699984+00	\N
dd9c774b-9993-40ec-8e33-095e4f4a9b96	sachindeep.redsky@gmail.com	Sachin DS	2026-06-09 11:02:54.075573+00	2026-10-13 12:14:47.086+00	cus_UXrUVAtjTgolcS
c6d060f7-29f7-4e9e-8ac3-813f7ad764d5	martincameron410@gmail.com	Cameron Martin 553	2026-10-20 15:38:23.328243+00	2026-10-20 15:38:23.328243+00	\N
4d6fedce-98bf-4bac-8792-dfad164458a5	cteran2024@icloud.com	Carlos	2026-10-22 21:13:06.468306+00	2026-10-22 21:13:06.468306+00	\N
\.


--
-- Data for Name: stripe_autofix_scan_log; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".stripe_autofix_scan_log (id, scanned_at, trigger, error_count, warning_count, issues, backend_mode, notified, notification_channel, notification_error, scan_error, auto_fix_attempted, auto_fix_results, post_fix_error_count, post_fix_warning_count, post_fix_issues) FROM stdin;
68da99bf-c108-45f9-ba19-d7d6f39b7470	2026-05-06 23:19:45.855353+00	manual-test	0	0	{}	unknown	f	\N	\N	\N	f	\N	\N	\N	\N
7fc3bf75-3f99-4cad-a5a5-afa7216ff99a	2026-05-06 23:43:06.295639+00	manual	0	0	{}	unknown	f	\N	\N	\N	f	\N	\N	\N	\N
f04d5943-9eee-41a0-a41a-7ba65c9e9bcb	2026-05-06 23:44:42.790474+00	manual	0	0	{}	unknown	f	\N	\N	\N	f	\N	\N	\N	\N
44a6f83f-67b5-4f42-8e0f-2ca67af6b939	2026-05-12 11:43:31.06112+00	manual	0	0	{}	test	f	\N	\N	\N	f	\N	\N	\N	\N
\.


--
-- Data for Name: stripe_autofix_schedule; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".stripe_autofix_schedule (id, enabled, notification_email, webhook_url, scan_webhook_url, monthly_price_id, yearly_price_id, frontend_mode, created_at, updated_at, auto_fix) FROM stdin;
singleton	f	\N	https://erbligiwkdfwxkhvwepw.functions.databasepad.com/stripe-webhook	\N	price_1TS6y1RtiiZxlanqjPRH40DD	price_1TS6zHRtiiZxlanqrloYUE2J	test	2026-05-06 23:17:29.954831+00	2026-05-12 11:43:26.894+00	f
\.


--
-- Data for Name: stripe_webhook_events; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".stripe_webhook_events (id, stripe_event_id, event_type, signature_valid, processed, is_test, status, error_message, payload_summary, received_at, processed_at) FROM stdin;
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_start, current_period_end, created_at, updated_at, provider, product_id, purchase_token, platform, auto_renewing, raw_receipt) FROM stdin;
3127b0df-99a5-4521-b5db-15f915fb9aac	d2885019-5ae6-4e8b-be25-7436d5e515f4	\N	\N	active	yearly	2026-07-23 23:16:53+00	2026-07-24 23:16:53+00	2026-07-23 23:17:10.788593+00	2026-07-23 23:17:10.653+00	stripe	\N	\N	\N	\N	\N
352711a2-5cc0-4cd7-b403-49884a1357fb	946ff1df-3a61-4e6e-a8f2-77e95ff413af	\N	\N	active	monthly	2026-08-03 00:09:06+00	2026-08-04 00:09:06+00	2026-08-03 00:09:23.146454+00	2026-08-03 00:09:22.727+00	stripe	\N	\N	\N	\N	\N
23f231a0-93ff-4a18-b2d7-9c3f079090f6	533dd482-8303-4a26-8e24-8b95c86d6a39	\N	\N	active	monthly	2026-09-04 14:32:56.353+00	2026-09-04 14:37:55.96+00	2026-09-04 14:33:38.987737+00	2026-09-04 14:33:38.882+00	google_play	com.fishingfinderusa.pro.monthly	ameeejajlflkfiganmcemebn.AO-J1Oyc6XsvhLoU0b9Ou8RT4prEGHFVjD29LG9NBLvA6jcwdoxmQ8b0zOKudYQ0GRWW22oZdb2UBTTgg0AIUdEPlY8bs6rdwg	android	t	{"etag": "d87d4d04eb8430cf433d5a4339633b11", "kind": "androidpublisher#subscriptionPurchaseV2", "lineItems": [{"productId": "com.fishingfinderusa.pro.monthly", "expiryTime": "2026-09-04T14:37:55.960Z", "offerPhase": {"basePrice": {}}, "offerDetails": {"basePlanId": "monthly-999"}, "autoRenewingPlan": {"recurringPrice": {"units": "1150", "currencyCode": "INR"}, "autoRenewEnabled": true}, "latestSuccessfulOrderId": "GPA.3389-2736-3956-49664"}], "startTime": "2026-09-04T14:32:56.353Z", "regionCode": "IN", "testPurchase": {}, "latestOrderId": "GPA.3389-2736-3956-49664", "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE", "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"}
0da3f2b0-97dc-45b4-b0e4-e457b96c8fad	794e9d40-ff0d-4137-bdf4-05482884016b	\N	\N	inactive	free	2026-10-15 08:23:17.564+00	2026-10-15 08:25:02.807+00	2026-09-04 14:56:01.375775+00	2026-10-15 08:25:02.807+00	admin	\N	\N	\N	f	\N
032fecd3-d03b-4996-b763-8da93c3ea6b1	7725439b-2cfb-4c99-901e-1c4351d9d4c1	\N	\N	active	monthly	2026-09-05 04:38:43.584+00	2026-09-05 04:43:43.269+00	2026-09-05 04:41:31.588899+00	2026-09-05 04:41:31.483+00	google_play	com.fishingfinderusa.pro.monthly	kidcknkoepgihkikccndmlcj.AO-J1OxIQJeoCfXvdQ5PvLQkEnonMmLH3lVNfbDEHZfQTmCjHOGYjVNLaUHG24RQ5w5lSuJjn3FNgyC5SEK0YPdZ8bdECv3PZg	android	f	{"etag": "4e742a855914a6b72793ef413fbdc259", "kind": "androidpublisher#subscriptionPurchaseV2", "lineItems": [{"productId": "com.fishingfinderusa.pro.monthly", "expiryTime": "2026-09-05T04:43:43.269Z", "offerPhase": {"basePrice": {}}, "offerDetails": {"basePlanId": "monthly-999"}, "autoRenewingPlan": {"recurringPrice": {"units": "1150", "currencyCode": "INR"}}, "latestSuccessfulOrderId": "GPA.3314-3663-4035-59928"}], "startTime": "2026-09-05T04:38:43.584Z", "regionCode": "IN", "testPurchase": {}, "latestOrderId": "GPA.3314-3663-4035-59928", "subscriptionState": "SUBSCRIPTION_STATE_CANCELED", "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED", "canceledStateContext": {"userInitiatedCancellation": {"cancelTime": "2026-09-05T04:40:56.751Z"}}}
89c7af72-0771-40d4-97d4-9f41027e5291	dcf38048-82c3-45d4-98fa-eacd2e81e8bf	\N	\N	active	pro	2026-10-13 13:32:42.418+00	2027-01-11 13:32:42.418+00	2026-10-13 12:10:39.366851+00	2026-10-13 13:32:42.418+00	admin	\N	\N	\N	f	\N
84f4ad3d-1796-412f-a39e-ec5bdce022c9	70b91795-95a4-4490-a304-2e113b6e33cc	\N	\N	active	yearly	2026-09-05 04:47:54.971+00	2026-09-05 05:14:07.674+00	2026-09-05 04:49:10.433414+00	2026-09-05 04:49:10.336+00	google_play	com.fishingfinderusa.pro.yearly	mgfcnmbcinpadljfealiibjh.AO-J1OwaBd_YxrD-_OJXa4VI70MGPY6OcSnVNactWc2-uwWmoMH73yoz4PFxLzh3aKxgYSgEO3N9NQ1M5N_O_VYBvZGbpy-0OA	android	f	{"etag": "b4f32ab43fcb4e769b9d8e52b8691de2", "kind": "androidpublisher#subscriptionPurchaseV2", "lineItems": [{"productId": "com.fishingfinderusa.pro.yearly", "expiryTime": "2026-09-05T05:14:07.674Z", "offerPhase": {"prorationPeriod": {}}, "offerDetails": {"basePlanId": "yearly-7999"}, "itemReplacement": {"productId": "com.fishingfinderusa.pro.yearly", "basePlanId": "yearly-7999", "replacementMode": "WITHOUT_PRORATION"}, "autoRenewingPlan": {"recurringPrice": {"units": "9000", "currencyCode": "INR"}}, "latestSuccessfulOrderId": "GPA.3363-8510-8507-83515"}], "startTime": "2026-09-05T04:47:54.971Z", "regionCode": "IN", "testPurchase": {}, "latestOrderId": "GPA.3363-8510-8507-83515", "subscriptionState": "SUBSCRIPTION_STATE_CANCELED", "linkedPurchaseToken": "elbabljdgkgblpfaioffjmai.AO-J1Ox-1QfHXHqHyhRMw_wxGzyqxRrVhNW7DU-eNLa8RU4Cw18J0IjZbsptEl_oYZOoeFzfVMpZX6kfQeiHTIu7NEyspu61Ww", "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED", "canceledStateContext": {"userInitiatedCancellation": {"cancelTime": "2026-09-05T04:48:21.141Z"}}}
9c0381c9-d0de-4c34-be94-ae7dbe54077e	84d44021-6ab6-49ab-aefe-c9ea8ca7c3aa	\N	\N	active	monthly	2026-09-07 10:15:45.337+00	2026-09-07 10:20:44.785+00	2026-09-07 10:16:03.580617+00	2026-09-07 10:16:03.442+00	google_play	com.fishingfinderusa.pro.monthly	bchecodcpofmfhoheekhoeok.AO-J1OxvdSylbU3OLLHmBGS3AyOwM9CpZCmweRLvo19zcbFXZFx1nVuRg-K-7i2l-ji9c0DWL190PR407OtekoV9d92-_P3xQA	android	t	{"etag": "38dbe0cc561df98e4407c131055e1b3e", "kind": "androidpublisher#subscriptionPurchaseV2", "lineItems": [{"productId": "com.fishingfinderusa.pro.monthly", "expiryTime": "2026-09-07T10:20:44.785Z", "offerPhase": {"basePrice": {}}, "offerDetails": {"basePlanId": "monthly-999"}, "autoRenewingPlan": {"recurringPrice": {"units": "1150", "currencyCode": "INR"}, "autoRenewEnabled": true}, "latestSuccessfulOrderId": "GPA.3354-4831-9426-51831"}], "startTime": "2026-09-07T10:15:45.337Z", "regionCode": "IN", "testPurchase": {}, "latestOrderId": "GPA.3354-4831-9426-51831", "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE", "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"}
18634fd8-343d-417b-b935-ba449231aff5	dd9c774b-9993-40ec-8e33-095e4f4a9b96	\N	\N	inactive	free	2026-10-13 14:09:18.027+00	2026-10-16 14:09:18.027+00	2026-10-13 13:45:44.956442+00	2026-10-28 08:35:03.808+00	admin	\N	\N	\N	f	\N
\.


--
-- Data for Name: trip_checklist_items; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".trip_checklist_items (id, trip_id, text, is_checked, category, sort_order, created_at) FROM stdin;
c7b6b994-46b5-4eae-a3a8-fa8d74e46d0a	866758ee-346f-4eec-a579-ec2b685518fd	Fishing rod(s) & reel(s)	f	Fishing Gear	0	2026-09-22 10:19:20.985078+00
\.


--
-- Data for Name: trips; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN; Owner: -
--

COPY "prj_F4XKrsTr5YoN".trips (id, user_id, spot_id, spot_name, spot_state, spot_type, accommodation_id, accommodation_name, start_date, end_date, notes, share_id, is_shared, created_at, updated_at) FROM stdin;
866758ee-346f-4eec-a579-ec2b685518fd	dd9c774b-9993-40ec-8e33-095e4f4a9b96	1	Lake Guntersville	Alabama	lake	2	Holiday Inn Express Guntersville	2026-09-23	2026-10-02		847cbbe091f74e53afc83510c9258df4	f	2026-09-22 10:19:20.312066+00	2026-09-22 10:19:20.312066+00
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

COPY "prj_F4XKrsTr5YoN_auth".identities (id, user_id, provider, identity_data, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

COPY "prj_F4XKrsTr5YoN_auth".users (id, email, encrypted_password, email_confirmed_at, phone, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) FROM stdin;
70b91795-95a4-4490-a304-2e113b6e33cc	madangopal.redskyatech@gmail.com	$2b$10$msqUoZRuozkR0qSXiMd3KeZFtaI7V3Z3gzsiwWCDQUEAnOBFzLhje	2026-09-05 04:48:58.518+00	\N	2026-09-05 04:48:58.518+00	2026-09-05 04:49:05.486+00	2026-09-05 04:49:05.486+00	{}	{}
84d44021-6ab6-49ab-aefe-c9ea8ca7c3aa	testinguser200110@gmail.com	$2b$10$LNOKSNNMfLFabTPYjFWkSOuSqlvd.y3n1zjw8DFZQRITFJ.sDiZsK	2026-09-07 10:15:30.449+00	\N	2026-09-07 10:15:30.449+00	2026-09-07 10:15:36.651+00	2026-09-07 10:15:36.651+00	{}	{}
dcf38048-82c3-45d4-98fa-eacd2e81e8bf	Brilansie_transp@bellsouth.net	$2b$10$mmQza4XIoUB82URiUK3gDuVB2k2ANOJo8AzeLFHNlYr4ND3/.wRl2	2026-10-10 05:50:36.554+00	\N	2026-10-10 05:50:36.554+00	2026-10-27 17:23:08.081+00	2026-10-27 17:23:08.081+00	{}	{}
e140c2fe-99d7-4eb9-9a67-f57a746e9e3f	sierraw91@yahoo.com	$2b$10$gZtYTWeKydla58H5rJ/FT.wX7j6TuTQ15PozHYM1PSN5/BDF0oVwG	2026-08-08 23:54:12.553+00	\N	2026-08-08 23:54:12.553+00	2026-08-08 23:54:26.561+00	2026-08-08 23:54:26.561+00	{}	{}
d1ac6a20-dfcd-46b1-9b36-8c731db5cb68	dktester812@gmail.com	$2b$10$P2u8bGlRtuAWMLz1oaZBP.o6dcXynpBn7osNF0M0fwgmwolgMnrra	2026-09-04 14:30:09.894+00	\N	2026-09-04 14:30:09.894+00	2026-10-13 12:26:30.19+00	2026-10-13 12:26:30.19+00	{}	{}
92f998ff-fb7e-4af2-8820-3785e4a71cd6	isha131722@gmail.com	$2b$10$v4eAUv8vKfyzXYfFOSUgaOlH0Pkge6N7XUafxEgaE2V1h5WNaGn1i	2026-09-04 13:20:21.52+00	\N	2026-09-04 13:20:21.52+00	2026-09-04 13:20:33.099+00	2026-09-04 13:20:33.099+00	{}	{}
853d59f9-851b-4db9-8320-29a6d161e45b	l87aa5p24g38b8vzwmu@icloud.com	$2b$10$3./cM1Vu1Y0YpQnGZKJvXeepKuOwd9.mqbsjZu56nxmRmwfbzzc3i	2026-06-15 18:39:11.263+00	\N	2026-06-15 18:39:11.263+00	2026-06-15 18:39:11.263+00	\N	{}	{}
d2885019-5ae6-4e8b-be25-7436d5e515f4	nathannorth2005@gmail.com	$2b$10$lTKS8zXCeClZRb8BtA.q0OdawNruKbyoWXBefsBx7S2FazXWeg5F.	2026-07-23 23:16:13.426+00	\N	2026-07-23 23:16:13.426+00	2026-07-23 23:16:20.938+00	2026-07-23 23:16:20.938+00	{}	{}
533dd482-8303-4a26-8e24-8b95c86d6a39	t7064732@gmail.com	$2b$10$sfXF9M6/QQViG1yUOeslhOk59zIiRxSOZ5M9hmNLlL1k1btzcljzi	2026-09-04 14:32:34.803+00	\N	2026-09-04 14:32:34.803+00	2026-09-04 14:32:44.208+00	2026-09-04 14:32:44.208+00	{}	{}
9f860127-7c96-47ad-bf88-3055f013ef8c	willt4032@gmail.com	$2b$10$3C3CpbAQc3tsuTdvxIiwBu3HJIwv7/KB027eiywWES4H.cn8IvC2W	2026-01-21 05:36:21.026+00	\N	2026-01-21 05:36:21.026+00	2026-10-14 01:58:06.88+00	2026-10-14 01:58:06.88+00	{}	{}
946ff1df-3a61-4e6e-a8f2-77e95ff413af	yhop24g38beqpz9ml79@icloud.com	$2b$10$3gsmsBB3mdxpAnccqN0Ck.qCbmqpYOVAdOIgs8NcxVZSvtT8SR2ea	2026-06-21 13:51:21.501+00	\N	2026-06-21 13:51:21.501+00	2026-08-03 00:06:39.887+00	2026-08-03 00:06:39.887+00	{}	{}
dd9c774b-9993-40ec-8e33-095e4f4a9b96	sachindeep.redsky@gmail.com	$2b$10$1j7ZyctyWJJ6UQcWc0KiHe3hR.dFaB8F3Ve/HMWT4qp5huXy01nKa	2026-06-09 11:02:52.84+00	\N	2026-06-09 11:02:52.84+00	2026-10-15 07:29:11.112+00	2026-10-15 07:29:11.112+00	{}	{}
7725439b-2cfb-4c99-901e-1c4351d9d4c1	testuser052002@gmail.com	$2b$10$IsQ/1RRLjY5fn/Kgu9vXQO1svFM9UL5wrWofSnC0XiQdJTOL8rkXW	2026-09-05 04:40:31.058+00	\N	2026-09-05 04:40:31.058+00	2026-09-05 04:40:37.269+00	2026-09-05 04:40:37.269+00	{}	{}
c6d060f7-29f7-4e9e-8ac3-813f7ad764d5	martincameron410@gmail.com	$2b$10$ku2.nRaW9qwUHwhXJW/4t.O3Drhm2bgd4F72jIsBm80ni5UbUuGlu	2026-10-20 15:38:22.806+00	\N	2026-10-20 15:38:22.806+00	2026-10-20 15:38:35.994+00	2026-10-20 15:38:35.994+00	{}	{}
794e9d40-ff0d-4137-bdf4-05482884016b	testuser6108@gmail.com	$2b$10$X2ZPYqtADgGtcetdFV9miuxIJA2qeXH6yh7TGHb1..XCOrqIae18S	2026-07-04 10:01:27.085+00	\N	2026-07-04 10:01:27.085+00	2026-09-28 05:19:31.907+00	2026-09-28 05:19:31.907+00	{}	{}
4d6fedce-98bf-4bac-8792-dfad164458a5	cteran2024@icloud.com	$2b$10$NhSuSfAjI7HcIeq1i98v/eoE8x0kMnFsiCj1bk09DlKdRZ8zabf7K	2026-10-22 21:13:05.812+00	\N	2026-10-22 21:13:05.812+00	2026-10-22 21:13:22.232+00	2026-10-22 21:13:22.232+00	{}	{}
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

COPY "prj_F4XKrsTr5YoN_storage".buckets (id, name, public, created_at, updated_at, file_size_limit, allowed_mime_types) FROM stdin;
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

COPY "prj_F4XKrsTr5YoN_storage".objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, path_tokens, version) FROM stdin;
\.


--
-- Name: accommodations_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".accommodations_id_seq', 134, true);


--
-- Name: fishing_licenses_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".fishing_licenses_id_seq', 50, true);


--
-- Name: fishing_regulations_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".fishing_regulations_id_seq', 238, true);


--
-- Name: fishing_spots_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".fishing_spots_id_seq', 1, false);


--
-- Name: lodging_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".lodging_id_seq', 168, true);


--
-- Name: lodging_reviews_id_seq; Type: SEQUENCE SET; Schema: prj_F4XKrsTr5YoN; Owner: -
--

SELECT pg_catalog.setval('"prj_F4XKrsTr5YoN".lodging_reviews_id_seq', 15, true);


--
-- Name: accommodations accommodations_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".accommodations
    ADD CONSTRAINT accommodations_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: catch_log catch_log_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".catch_log
    ADD CONSTRAINT catch_log_pkey PRIMARY KEY (id);


--
-- Name: catches catches_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".catches
    ADD CONSTRAINT catches_pkey PRIMARY KEY (id);


--
-- Name: crm_appointments crm_appointments_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_appointments
    ADD CONSTRAINT crm_appointments_pkey PRIMARY KEY (id);


--
-- Name: crm_availability crm_availability_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_availability
    ADD CONSTRAINT crm_availability_pkey PRIMARY KEY (id);


--
-- Name: crm_calendar_members crm_calendar_members_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_calendar_members
    ADD CONSTRAINT crm_calendar_members_pkey PRIMARY KEY (id);


--
-- Name: crm_calendars crm_calendars_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_calendars
    ADD CONSTRAINT crm_calendars_pkey PRIMARY KEY (id);


--
-- Name: crm_calendly_connections crm_calendly_connections_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_calendly_connections
    ADD CONSTRAINT crm_calendly_connections_pkey PRIMARY KEY (id);


--
-- Name: crm_campaigns crm_campaigns_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_campaigns
    ADD CONSTRAINT crm_campaigns_pkey PRIMARY KEY (id);


--
-- Name: crm_contact_lists crm_contact_lists_contact_id_list_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contact_lists
    ADD CONSTRAINT crm_contact_lists_contact_id_list_id_key UNIQUE (contact_id, list_id);


--
-- Name: crm_contact_lists crm_contact_lists_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contact_lists
    ADD CONSTRAINT crm_contact_lists_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_email_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contacts
    ADD CONSTRAINT crm_contacts_email_key UNIQUE (email);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_events crm_events_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_events
    ADD CONSTRAINT crm_events_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_logs crm_flow_logs_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_logs
    ADD CONSTRAINT crm_flow_logs_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_step_queue crm_flow_step_queue_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_step_queue
    ADD CONSTRAINT crm_flow_step_queue_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_steps crm_flow_steps_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_steps
    ADD CONSTRAINT crm_flow_steps_pkey PRIMARY KEY (id);


--
-- Name: crm_flows crm_flows_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flows
    ADD CONSTRAINT crm_flows_pkey PRIMARY KEY (id);


--
-- Name: crm_goal_actions crm_goal_actions_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_actions
    ADD CONSTRAINT crm_goal_actions_pkey PRIMARY KEY (id);


--
-- Name: crm_goal_contacts crm_goal_contacts_goal_id_contact_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_contacts
    ADD CONSTRAINT crm_goal_contacts_goal_id_contact_id_key UNIQUE (goal_id, contact_id);


--
-- Name: crm_goal_contacts crm_goal_contacts_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_contacts
    ADD CONSTRAINT crm_goal_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_goal_runs crm_goal_runs_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_runs
    ADD CONSTRAINT crm_goal_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_goal_work crm_goal_work_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_work
    ADD CONSTRAINT crm_goal_work_pkey PRIMARY KEY (id);


--
-- Name: crm_goals crm_goals_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goals
    ADD CONSTRAINT crm_goals_pkey PRIMARY KEY (id);


--
-- Name: crm_lists crm_lists_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_lists
    ADD CONSTRAINT crm_lists_pkey PRIMARY KEY (id);


--
-- Name: crm_opportunities crm_opportunities_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunities
    ADD CONSTRAINT crm_opportunities_pkey PRIMARY KEY (id);


--
-- Name: crm_opportunity_events crm_opportunity_events_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunity_events
    ADD CONSTRAINT crm_opportunity_events_pkey PRIMARY KEY (id);


--
-- Name: crm_pipeline_stages crm_pipeline_stages_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_pipeline_stages
    ADD CONSTRAINT crm_pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: crm_pipelines crm_pipelines_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_pipelines
    ADD CONSTRAINT crm_pipelines_pkey PRIMARY KEY (id);


--
-- Name: crm_sends crm_sends_idempotency_key_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: crm_sends crm_sends_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_spot_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".favorites
    ADD CONSTRAINT favorites_user_id_spot_id_key UNIQUE (user_id, spot_id);


--
-- Name: fishing_licenses fishing_licenses_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_licenses
    ADD CONSTRAINT fishing_licenses_pkey PRIMARY KEY (id);


--
-- Name: fishing_licenses fishing_licenses_state_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_licenses
    ADD CONSTRAINT fishing_licenses_state_key UNIQUE (state);


--
-- Name: fishing_regulations fishing_regulations_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_regulations
    ADD CONSTRAINT fishing_regulations_pkey PRIMARY KEY (id);


--
-- Name: fishing_species fishing_species_name_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_species
    ADD CONSTRAINT fishing_species_name_key UNIQUE (name);


--
-- Name: fishing_species fishing_species_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_species
    ADD CONSTRAINT fishing_species_pkey PRIMARY KEY (id);


--
-- Name: fishing_spot_species fishing_spot_species_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_spot_species
    ADD CONSTRAINT fishing_spot_species_pkey PRIMARY KEY (fishing_spot_id, species_id);


--
-- Name: fishing_spots fishing_spots_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_spots
    ADD CONSTRAINT fishing_spots_pkey PRIMARY KEY (id);


--
-- Name: fishing_spots fishing_spots_slug_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_spots
    ADD CONSTRAINT fishing_spots_slug_key UNIQUE (slug);


--
-- Name: lodging lodging_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".lodging
    ADD CONSTRAINT lodging_pkey PRIMARY KEY (id);


--
-- Name: lodging_reviews lodging_reviews_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".lodging_reviews
    ADD CONSTRAINT lodging_reviews_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: stripe_autofix_scan_log stripe_autofix_scan_log_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".stripe_autofix_scan_log
    ADD CONSTRAINT stripe_autofix_scan_log_pkey PRIMARY KEY (id);


--
-- Name: stripe_autofix_schedule stripe_autofix_schedule_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".stripe_autofix_schedule
    ADD CONSTRAINT stripe_autofix_schedule_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_stripe_event_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: trip_checklist_items trip_checklist_items_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".trip_checklist_items
    ADD CONSTRAINT trip_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--
-- Name: trips trips_share_id_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".trips
    ADD CONSTRAINT trips_share_id_key UNIQUE (share_id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_auth".identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_auth".users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_auth".users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_name_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_storage".buckets
    ADD CONSTRAINT buckets_name_key UNIQUE (name);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_storage".buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_bucket_id_name_key; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_storage".objects
    ADD CONSTRAINT objects_bucket_id_name_key UNIQUE (bucket_id, name);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_storage".objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: crm_calendar_members_calendar_user_unique; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_calendar_members_calendar_user_unique ON "prj_F4XKrsTr5YoN".crm_calendar_members USING btree (calendar_id, user_id);


--
-- Name: crm_calendars_slug_unique; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_calendars_slug_unique ON "prj_F4XKrsTr5YoN".crm_calendars USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: crm_calendly_connections_user_uri_unique; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_calendly_connections_user_uri_unique ON "prj_F4XKrsTr5YoN".crm_calendly_connections USING btree (user_id, calendly_user_uri);


--
-- Name: crm_events_channel_event_type_created_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX crm_events_channel_event_type_created_idx ON "prj_F4XKrsTr5YoN".crm_events USING btree (channel, event_type, created_at DESC);


--
-- Name: crm_events_contact_channel_event_type_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX crm_events_contact_channel_event_type_idx ON "prj_F4XKrsTr5YoN".crm_events USING btree (contact_id, channel, event_type);


--
-- Name: crm_pipeline_stages_one_lost; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_pipeline_stages_one_lost ON "prj_F4XKrsTr5YoN".crm_pipeline_stages USING btree (pipeline_id) WHERE (type = 'lost'::text);


--
-- Name: crm_pipeline_stages_one_won; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_pipeline_stages_one_won ON "prj_F4XKrsTr5YoN".crm_pipeline_stages USING btree (pipeline_id) WHERE (type = 'won'::text);


--
-- Name: crm_pipelines_one_default; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX crm_pipelines_one_default ON "prj_F4XKrsTr5YoN".crm_pipelines USING btree (is_default) WHERE is_default;


--
-- Name: fishing_spot_species_species_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spot_species_species_idx ON "prj_F4XKrsTr5YoN".fishing_spot_species USING btree (species_id);


--
-- Name: fishing_spots_city_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_city_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING btree (city);


--
-- Name: fishing_spots_coordinates_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_coordinates_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING btree (latitude, longitude);


--
-- Name: fishing_spots_name_search_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_name_search_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING gin (to_tsvector('simple'::regconfig, ((((name || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || state)));


--
-- Name: fishing_spots_state_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_state_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING btree (state);


--
-- Name: fishing_spots_status_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_status_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING btree (status);


--
-- Name: fishing_spots_water_type_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX fishing_spots_water_type_idx ON "prj_F4XKrsTr5YoN".fishing_spots USING btree (water_type);


--
-- Name: idx_accommodations_spot_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_accommodations_spot_id ON "prj_F4XKrsTr5YoN".accommodations USING btree (spot_id);


--
-- Name: idx_catch_log_date; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catch_log_date ON "prj_F4XKrsTr5YoN".catch_log USING btree (date);


--
-- Name: idx_catch_log_species; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catch_log_species ON "prj_F4XKrsTr5YoN".catch_log USING btree (species);


--
-- Name: idx_catch_log_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catch_log_user_id ON "prj_F4XKrsTr5YoN".catch_log USING btree (user_id);


--
-- Name: idx_catches_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catches_created_at ON "prj_F4XKrsTr5YoN".catches USING btree (created_at DESC);


--
-- Name: idx_catches_spot_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catches_spot_id ON "prj_F4XKrsTr5YoN".catches USING btree (spot_id);


--
-- Name: idx_catches_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_catches_user_id ON "prj_F4XKrsTr5YoN".catches USING btree (user_id);


--
-- Name: idx_checklist_trip_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_checklist_trip_id ON "prj_F4XKrsTr5YoN".trip_checklist_items USING btree (trip_id);


--
-- Name: idx_crm_appointments_assigned_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_appointments_assigned_user_id ON "prj_F4XKrsTr5YoN".crm_appointments USING btree (assigned_user_id);


--
-- Name: idx_crm_appointments_calendar_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_appointments_calendar_id ON "prj_F4XKrsTr5YoN".crm_appointments USING btree (calendar_id);


--
-- Name: idx_crm_appointments_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_appointments_contact_id ON "prj_F4XKrsTr5YoN".crm_appointments USING btree (contact_id);


--
-- Name: idx_crm_appointments_starts_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_appointments_starts_at ON "prj_F4XKrsTr5YoN".crm_appointments USING btree (starts_at);


--
-- Name: idx_crm_appointments_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_appointments_status ON "prj_F4XKrsTr5YoN".crm_appointments USING btree (status);


--
-- Name: idx_crm_availability_calendar_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_availability_calendar_id ON "prj_F4XKrsTr5YoN".crm_availability USING btree (calendar_id);


--
-- Name: idx_crm_calendar_members_calendar_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendar_members_calendar_id ON "prj_F4XKrsTr5YoN".crm_calendar_members USING btree (calendar_id);


--
-- Name: idx_crm_calendar_members_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendar_members_user_id ON "prj_F4XKrsTr5YoN".crm_calendar_members USING btree (user_id);


--
-- Name: idx_crm_calendars_calendly_connection; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendars_calendly_connection ON "prj_F4XKrsTr5YoN".crm_calendars USING btree (calendly_connection_id) WHERE (calendly_connection_id IS NOT NULL);


--
-- Name: idx_crm_calendars_is_active; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendars_is_active ON "prj_F4XKrsTr5YoN".crm_calendars USING btree (is_active);


--
-- Name: idx_crm_calendars_owner_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendars_owner_user_id ON "prj_F4XKrsTr5YoN".crm_calendars USING btree (owner_user_id);


--
-- Name: idx_crm_calendly_connections_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_calendly_connections_user_id ON "prj_F4XKrsTr5YoN".crm_calendly_connections USING btree (user_id);


--
-- Name: idx_crm_campaigns_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_campaigns_created_at ON "prj_F4XKrsTr5YoN".crm_campaigns USING btree (created_at);


--
-- Name: idx_crm_campaigns_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_campaigns_goal_id ON "prj_F4XKrsTr5YoN".crm_campaigns USING btree (goal_id);


--
-- Name: idx_crm_campaigns_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_campaigns_status ON "prj_F4XKrsTr5YoN".crm_campaigns USING btree (status);


--
-- Name: idx_crm_contact_lists_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contact_lists_contact_id ON "prj_F4XKrsTr5YoN".crm_contact_lists USING btree (contact_id);


--
-- Name: idx_crm_contact_lists_list_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contact_lists_list_id ON "prj_F4XKrsTr5YoN".crm_contact_lists USING btree (list_id);


--
-- Name: idx_crm_contacts_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_created_at ON "prj_F4XKrsTr5YoN".crm_contacts USING btree (created_at);


--
-- Name: idx_crm_contacts_email; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX idx_crm_contacts_email ON "prj_F4XKrsTr5YoN".crm_contacts USING btree (email);


--
-- Name: idx_crm_contacts_purchased_product_ids; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_purchased_product_ids ON "prj_F4XKrsTr5YoN".crm_contacts USING gin (purchased_product_ids);


--
-- Name: idx_crm_contacts_purchased_product_names; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_purchased_product_names ON "prj_F4XKrsTr5YoN".crm_contacts USING gin (purchased_product_names);


--
-- Name: idx_crm_contacts_source; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_source ON "prj_F4XKrsTr5YoN".crm_contacts USING btree (source);


--
-- Name: idx_crm_contacts_subscribed; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_subscribed ON "prj_F4XKrsTr5YoN".crm_contacts USING btree (subscribed);


--
-- Name: idx_crm_contacts_tags; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_contacts_tags ON "prj_F4XKrsTr5YoN".crm_contacts USING gin (tags);


--
-- Name: idx_crm_events_campaign_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_campaign_id ON "prj_F4XKrsTr5YoN".crm_events USING btree (campaign_id);


--
-- Name: idx_crm_events_channel; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_channel ON "prj_F4XKrsTr5YoN".crm_events USING btree (channel);


--
-- Name: idx_crm_events_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_contact_id ON "prj_F4XKrsTr5YoN".crm_events USING btree (contact_id);


--
-- Name: idx_crm_events_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_created_at ON "prj_F4XKrsTr5YoN".crm_events USING btree (created_at);


--
-- Name: idx_crm_events_event_key; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE UNIQUE INDEX idx_crm_events_event_key ON "prj_F4XKrsTr5YoN".crm_events USING btree (event_key) WHERE (event_key IS NOT NULL);


--
-- Name: idx_crm_events_event_type; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_event_type ON "prj_F4XKrsTr5YoN".crm_events USING btree (event_type);


--
-- Name: idx_crm_events_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_goal_id ON "prj_F4XKrsTr5YoN".crm_events USING btree (goal_id);


--
-- Name: idx_crm_events_send_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_events_send_id ON "prj_F4XKrsTr5YoN".crm_events USING btree (send_id);


--
-- Name: idx_crm_flow_logs_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flow_logs_contact_id ON "prj_F4XKrsTr5YoN".crm_flow_logs USING btree (contact_id);


--
-- Name: idx_crm_flow_logs_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flow_logs_created_at ON "prj_F4XKrsTr5YoN".crm_flow_logs USING btree (created_at);


--
-- Name: idx_crm_flow_logs_flow_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flow_logs_flow_id ON "prj_F4XKrsTr5YoN".crm_flow_logs USING btree (flow_id);


--
-- Name: idx_crm_flow_step_queue_due; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flow_step_queue_due ON "prj_F4XKrsTr5YoN".crm_flow_step_queue USING btree (run_at) WHERE ((finished_at IS NULL) AND (attempts < max_attempts));


--
-- Name: idx_crm_flow_steps_flow_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flow_steps_flow_id ON "prj_F4XKrsTr5YoN".crm_flow_steps USING btree (flow_id);


--
-- Name: idx_crm_flows_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flows_goal_id ON "prj_F4XKrsTr5YoN".crm_flows USING btree (goal_id);


--
-- Name: idx_crm_flows_is_active; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flows_is_active ON "prj_F4XKrsTr5YoN".crm_flows USING btree (is_active);


--
-- Name: idx_crm_flows_trigger_type; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_flows_trigger_type ON "prj_F4XKrsTr5YoN".crm_flows USING btree (trigger_type);


--
-- Name: idx_crm_goal_actions_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_actions_goal_id ON "prj_F4XKrsTr5YoN".crm_goal_actions USING btree (goal_id);


--
-- Name: idx_crm_goal_contacts_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_contacts_contact_id ON "prj_F4XKrsTr5YoN".crm_goal_contacts USING btree (contact_id);


--
-- Name: idx_crm_goal_contacts_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_contacts_goal_id ON "prj_F4XKrsTr5YoN".crm_goal_contacts USING btree (goal_id);


--
-- Name: idx_crm_goal_contacts_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_contacts_status ON "prj_F4XKrsTr5YoN".crm_goal_contacts USING btree (status);


--
-- Name: idx_crm_goal_runs_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_runs_goal_id ON "prj_F4XKrsTr5YoN".crm_goal_runs USING btree (goal_id);


--
-- Name: idx_crm_goal_work_due; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goal_work_due ON "prj_F4XKrsTr5YoN".crm_goal_work USING btree (not_before) WHERE ((finished_at IS NULL) AND (attempts < max_attempts));


--
-- Name: idx_crm_goals_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_goals_status ON "prj_F4XKrsTr5YoN".crm_goals USING btree (status);


--
-- Name: idx_crm_lists_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_lists_goal_id ON "prj_F4XKrsTr5YoN".crm_lists USING btree (goal_id);


--
-- Name: idx_crm_opportunities_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_opportunities_contact_id ON "prj_F4XKrsTr5YoN".crm_opportunities USING btree (contact_id);


--
-- Name: idx_crm_opportunities_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_opportunities_created_at ON "prj_F4XKrsTr5YoN".crm_opportunities USING btree (created_at);


--
-- Name: idx_crm_opportunities_pipeline_stage; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_opportunities_pipeline_stage ON "prj_F4XKrsTr5YoN".crm_opportunities USING btree (pipeline_id, stage_id);


--
-- Name: idx_crm_opportunities_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_opportunities_status ON "prj_F4XKrsTr5YoN".crm_opportunities USING btree (status);


--
-- Name: idx_crm_opportunity_events_opp; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_opportunity_events_opp ON "prj_F4XKrsTr5YoN".crm_opportunity_events USING btree (opportunity_id, created_at);


--
-- Name: idx_crm_pipeline_stages_pipeline_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_pipeline_stages_pipeline_id ON "prj_F4XKrsTr5YoN".crm_pipeline_stages USING btree (pipeline_id);


--
-- Name: idx_crm_sends_campaign_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_campaign_id ON "prj_F4XKrsTr5YoN".crm_sends USING btree (campaign_id);


--
-- Name: idx_crm_sends_contact_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_contact_id ON "prj_F4XKrsTr5YoN".crm_sends USING btree (contact_id);


--
-- Name: idx_crm_sends_goal_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_goal_id ON "prj_F4XKrsTr5YoN".crm_sends USING btree (goal_id);


--
-- Name: idx_crm_sends_in_reply_to; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_in_reply_to ON "prj_F4XKrsTr5YoN".crm_sends USING btree (in_reply_to);


--
-- Name: idx_crm_sends_mailgun_message_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_mailgun_message_id ON "prj_F4XKrsTr5YoN".crm_sends USING btree (mailgun_message_id);


--
-- Name: idx_crm_sends_status; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_crm_sends_status ON "prj_F4XKrsTr5YoN".crm_sends USING btree (status);


--
-- Name: idx_fishing_regulations_species; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_fishing_regulations_species ON "prj_F4XKrsTr5YoN".fishing_regulations USING btree (species);


--
-- Name: idx_fishing_regulations_state; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_fishing_regulations_state ON "prj_F4XKrsTr5YoN".fishing_regulations USING btree (state);


--
-- Name: idx_fishing_regulations_water_body; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_fishing_regulations_water_body ON "prj_F4XKrsTr5YoN".fishing_regulations USING btree (water_body_type);


--
-- Name: idx_lodging_reviews_created_at; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_lodging_reviews_created_at ON "prj_F4XKrsTr5YoN".lodging_reviews USING btree (created_at DESC);


--
-- Name: idx_lodging_reviews_lodging_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_lodging_reviews_lodging_id ON "prj_F4XKrsTr5YoN".lodging_reviews USING btree (lodging_id);


--
-- Name: idx_lodging_reviews_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_lodging_reviews_user_id ON "prj_F4XKrsTr5YoN".lodging_reviews USING btree (user_id);


--
-- Name: idx_profiles_stripe_customer_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_profiles_stripe_customer_id ON "prj_F4XKrsTr5YoN".profiles USING btree (stripe_customer_id);


--
-- Name: idx_subscriptions_stripe_customer_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_subscriptions_stripe_customer_id ON "prj_F4XKrsTr5YoN".subscriptions USING btree (stripe_customer_id);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON "prj_F4XKrsTr5YoN".subscriptions USING btree (user_id);


--
-- Name: idx_trips_share_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_trips_share_id ON "prj_F4XKrsTr5YoN".trips USING btree (share_id);


--
-- Name: idx_trips_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX idx_trips_user_id ON "prj_F4XKrsTr5YoN".trips USING btree (user_id);


--
-- Name: stripe_autofix_scan_log_scanned_at_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX stripe_autofix_scan_log_scanned_at_idx ON "prj_F4XKrsTr5YoN".stripe_autofix_scan_log USING btree (scanned_at DESC);


--
-- Name: stripe_webhook_events_received_at_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX stripe_webhook_events_received_at_idx ON "prj_F4XKrsTr5YoN".stripe_webhook_events USING btree (received_at DESC);


--
-- Name: subscriptions_purchase_token_idx; Type: INDEX; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE INDEX subscriptions_purchase_token_idx ON "prj_F4XKrsTr5YoN".subscriptions USING btree (purchase_token);


--
-- Name: idx_identities_user_id; Type: INDEX; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE INDEX idx_identities_user_id ON "prj_F4XKrsTr5YoN_auth".identities USING btree (user_id);


--
-- Name: fishing_species fishing_species_updated_at; Type: TRIGGER; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TRIGGER fishing_species_updated_at BEFORE UPDATE ON "prj_F4XKrsTr5YoN".fishing_species FOR EACH ROW EXECUTE FUNCTION "prj_F4XKrsTr5YoN".set_updated_at();


--
-- Name: subscriptions realtime_trigger_subscriptions; Type: TRIGGER; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TRIGGER realtime_trigger_subscriptions AFTER INSERT OR DELETE OR UPDATE ON "prj_F4XKrsTr5YoN".subscriptions FOR EACH ROW EXECUTE FUNCTION "prj_F4XKrsTr5YoN".realtime_notify_subscriptions();


--
-- Name: lodging_reviews update_lodging_rating_on_delete; Type: TRIGGER; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TRIGGER update_lodging_rating_on_delete AFTER DELETE ON "prj_F4XKrsTr5YoN".lodging_reviews FOR EACH ROW EXECUTE FUNCTION "prj_F4XKrsTr5YoN".update_lodging_rating();


--
-- Name: lodging_reviews update_lodging_rating_on_insert; Type: TRIGGER; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TRIGGER update_lodging_rating_on_insert AFTER INSERT ON "prj_F4XKrsTr5YoN".lodging_reviews FOR EACH ROW EXECUTE FUNCTION "prj_F4XKrsTr5YoN".update_lodging_rating();


--
-- Name: lodging_reviews update_lodging_rating_on_update; Type: TRIGGER; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE TRIGGER update_lodging_rating_on_update AFTER UPDATE ON "prj_F4XKrsTr5YoN".lodging_reviews FOR EACH ROW EXECUTE FUNCTION "prj_F4XKrsTr5YoN".update_lodging_rating();


--
-- Name: admins admins_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".admins
    ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN".profiles(id) ON DELETE CASCADE;


--
-- Name: catches catches_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".catches
    ADD CONSTRAINT catches_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: crm_appointments crm_appointments_calendar_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_appointments
    ADD CONSTRAINT crm_appointments_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES "prj_F4XKrsTr5YoN".crm_calendars(id) ON DELETE CASCADE;


--
-- Name: crm_appointments crm_appointments_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_appointments
    ADD CONSTRAINT crm_appointments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_availability crm_availability_calendar_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_availability
    ADD CONSTRAINT crm_availability_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES "prj_F4XKrsTr5YoN".crm_calendars(id) ON DELETE CASCADE;


--
-- Name: crm_calendar_members crm_calendar_members_calendar_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_calendar_members
    ADD CONSTRAINT crm_calendar_members_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES "prj_F4XKrsTr5YoN".crm_calendars(id) ON DELETE CASCADE;


--
-- Name: crm_calendars crm_calendars_calendly_connection_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_calendars
    ADD CONSTRAINT crm_calendars_calendly_connection_id_fkey FOREIGN KEY (calendly_connection_id) REFERENCES "prj_F4XKrsTr5YoN".crm_calendly_connections(id) ON DELETE SET NULL;


--
-- Name: crm_campaigns crm_campaigns_list_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_campaigns
    ADD CONSTRAINT crm_campaigns_list_id_fkey FOREIGN KEY (list_id) REFERENCES "prj_F4XKrsTr5YoN".crm_lists(id) ON DELETE SET NULL;


--
-- Name: crm_contact_lists crm_contact_lists_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contact_lists
    ADD CONSTRAINT crm_contact_lists_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_contact_lists crm_contact_lists_list_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_contact_lists
    ADD CONSTRAINT crm_contact_lists_list_id_fkey FOREIGN KEY (list_id) REFERENCES "prj_F4XKrsTr5YoN".crm_lists(id) ON DELETE CASCADE;


--
-- Name: crm_events crm_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_events
    ADD CONSTRAINT crm_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES "prj_F4XKrsTr5YoN".crm_campaigns(id) ON DELETE CASCADE;


--
-- Name: crm_events crm_events_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_events
    ADD CONSTRAINT crm_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_flow_logs crm_flow_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_logs
    ADD CONSTRAINT crm_flow_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_flow_logs crm_flow_logs_flow_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_logs
    ADD CONSTRAINT crm_flow_logs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES "prj_F4XKrsTr5YoN".crm_flows(id) ON DELETE CASCADE;


--
-- Name: crm_flow_logs crm_flow_logs_step_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_logs
    ADD CONSTRAINT crm_flow_logs_step_id_fkey FOREIGN KEY (step_id) REFERENCES "prj_F4XKrsTr5YoN".crm_flow_steps(id) ON DELETE SET NULL;


--
-- Name: crm_flow_step_queue crm_flow_step_queue_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_step_queue
    ADD CONSTRAINT crm_flow_step_queue_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_flow_step_queue crm_flow_step_queue_flow_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_step_queue
    ADD CONSTRAINT crm_flow_step_queue_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES "prj_F4XKrsTr5YoN".crm_flows(id) ON DELETE CASCADE;


--
-- Name: crm_flow_steps crm_flow_steps_flow_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_flow_steps
    ADD CONSTRAINT crm_flow_steps_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES "prj_F4XKrsTr5YoN".crm_flows(id) ON DELETE CASCADE;


--
-- Name: crm_goal_actions crm_goal_actions_goal_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_actions
    ADD CONSTRAINT crm_goal_actions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES "prj_F4XKrsTr5YoN".crm_goals(id) ON DELETE CASCADE;


--
-- Name: crm_goal_contacts crm_goal_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_contacts
    ADD CONSTRAINT crm_goal_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_goal_contacts crm_goal_contacts_goal_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_contacts
    ADD CONSTRAINT crm_goal_contacts_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES "prj_F4XKrsTr5YoN".crm_goals(id) ON DELETE CASCADE;


--
-- Name: crm_goal_runs crm_goal_runs_goal_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_runs
    ADD CONSTRAINT crm_goal_runs_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES "prj_F4XKrsTr5YoN".crm_goals(id) ON DELETE CASCADE;


--
-- Name: crm_goal_work crm_goal_work_goal_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_goal_work
    ADD CONSTRAINT crm_goal_work_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES "prj_F4XKrsTr5YoN".crm_goals(id) ON DELETE CASCADE;


--
-- Name: crm_opportunities crm_opportunities_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunities
    ADD CONSTRAINT crm_opportunities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_opportunities crm_opportunities_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunities
    ADD CONSTRAINT crm_opportunities_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES "prj_F4XKrsTr5YoN".crm_pipelines(id) ON DELETE CASCADE;


--
-- Name: crm_opportunities crm_opportunities_stage_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunities
    ADD CONSTRAINT crm_opportunities_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES "prj_F4XKrsTr5YoN".crm_pipeline_stages(id) ON DELETE RESTRICT;


--
-- Name: crm_opportunity_events crm_opportunity_events_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_opportunity_events
    ADD CONSTRAINT crm_opportunity_events_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES "prj_F4XKrsTr5YoN".crm_opportunities(id) ON DELETE CASCADE;


--
-- Name: crm_pipeline_stages crm_pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_pipeline_stages
    ADD CONSTRAINT crm_pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES "prj_F4XKrsTr5YoN".crm_pipelines(id) ON DELETE CASCADE;


--
-- Name: crm_sends crm_sends_campaign_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES "prj_F4XKrsTr5YoN".crm_campaigns(id) ON DELETE SET NULL;


--
-- Name: crm_sends crm_sends_contact_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES "prj_F4XKrsTr5YoN".crm_contacts(id) ON DELETE CASCADE;


--
-- Name: crm_sends crm_sends_flow_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES "prj_F4XKrsTr5YoN".crm_flows(id) ON DELETE SET NULL;


--
-- Name: crm_sends crm_sends_goal_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".crm_sends
    ADD CONSTRAINT crm_sends_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES "prj_F4XKrsTr5YoN".crm_goals(id) ON DELETE SET NULL;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: fishing_spot_species fishing_spot_species_species_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_spot_species
    ADD CONSTRAINT fishing_spot_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES "prj_F4XKrsTr5YoN".fishing_species(id) ON DELETE CASCADE;


--
-- Name: fishing_spot_species fishing_spot_species_spot_fk; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".fishing_spot_species
    ADD CONSTRAINT fishing_spot_species_spot_fk FOREIGN KEY (fishing_spot_id) REFERENCES "prj_F4XKrsTr5YoN".fishing_spots(id) ON DELETE CASCADE;


--
-- Name: lodging_reviews lodging_reviews_lodging_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".lodging_reviews
    ADD CONSTRAINT lodging_reviews_lodging_id_fkey FOREIGN KEY (lodging_id) REFERENCES "prj_F4XKrsTr5YoN".lodging(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: trip_checklist_items trip_checklist_items_trip_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".trip_checklist_items
    ADD CONSTRAINT trip_checklist_items_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES "prj_F4XKrsTr5YoN".trips(id) ON DELETE CASCADE;


--
-- Name: trips trips_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN".trips
    ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_auth".identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES "prj_F4XKrsTr5YoN_auth".users(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucket_id_fkey; Type: FK CONSTRAINT; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE ONLY "prj_F4XKrsTr5YoN_storage".objects
    ADD CONSTRAINT objects_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES "prj_F4XKrsTr5YoN_storage".buckets(id) ON DELETE CASCADE;


--
-- Name: fishing_regulations Allow public read access on fishing_regulations; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Allow public read access on fishing_regulations" ON "prj_F4XKrsTr5YoN".fishing_regulations FOR SELECT USING (true);


--
-- Name: lodging Allow public read access on lodging; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Allow public read access on lodging" ON "prj_F4XKrsTr5YoN".lodging FOR SELECT USING (true);


--
-- Name: catch_log Allow public read for leaderboard; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Allow public read for leaderboard" ON "prj_F4XKrsTr5YoN".catch_log FOR SELECT USING (true);


--
-- Name: catches Anyone can read catch counts; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Anyone can read catch counts" ON "prj_F4XKrsTr5YoN".catches FOR SELECT USING (true);


--
-- Name: fishing_licenses Anyone can read fishing licenses; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Anyone can read fishing licenses" ON "prj_F4XKrsTr5YoN".fishing_licenses FOR SELECT USING (true);


--
-- Name: lodging_reviews Anyone can read lodging reviews; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Anyone can read lodging reviews" ON "prj_F4XKrsTr5YoN".lodging_reviews FOR SELECT USING (true);


--
-- Name: profiles Anyone can view profiles; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Anyone can view profiles" ON "prj_F4XKrsTr5YoN".profiles FOR SELECT USING (true);


--
-- Name: lodging_reviews Authenticated users can insert reviews; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Authenticated users can insert reviews" ON "prj_F4XKrsTr5YoN".lodging_reviews FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: crm_appointments CRM appointments deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM appointments deletable" ON "prj_F4XKrsTr5YoN".crm_appointments FOR DELETE USING (true);


--
-- Name: crm_appointments CRM appointments insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM appointments insertable" ON "prj_F4XKrsTr5YoN".crm_appointments FOR INSERT WITH CHECK (true);


--
-- Name: crm_appointments CRM appointments readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM appointments readable" ON "prj_F4XKrsTr5YoN".crm_appointments FOR SELECT USING (true);


--
-- Name: crm_appointments CRM appointments updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM appointments updatable" ON "prj_F4XKrsTr5YoN".crm_appointments FOR UPDATE USING (true);


--
-- Name: crm_availability CRM availability deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM availability deletable" ON "prj_F4XKrsTr5YoN".crm_availability FOR DELETE USING (true);


--
-- Name: crm_availability CRM availability insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM availability insertable" ON "prj_F4XKrsTr5YoN".crm_availability FOR INSERT WITH CHECK (true);


--
-- Name: crm_availability CRM availability readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM availability readable" ON "prj_F4XKrsTr5YoN".crm_availability FOR SELECT USING (true);


--
-- Name: crm_availability CRM availability updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM availability updatable" ON "prj_F4XKrsTr5YoN".crm_availability FOR UPDATE USING (true);


--
-- Name: crm_calendar_members CRM calendar members deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendar members deletable" ON "prj_F4XKrsTr5YoN".crm_calendar_members FOR DELETE USING (true);


--
-- Name: crm_calendar_members CRM calendar members insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendar members insertable" ON "prj_F4XKrsTr5YoN".crm_calendar_members FOR INSERT WITH CHECK (true);


--
-- Name: crm_calendar_members CRM calendar members readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendar members readable" ON "prj_F4XKrsTr5YoN".crm_calendar_members FOR SELECT USING (true);


--
-- Name: crm_calendar_members CRM calendar members updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendar members updatable" ON "prj_F4XKrsTr5YoN".crm_calendar_members FOR UPDATE USING (true);


--
-- Name: crm_calendars CRM calendars deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendars deletable" ON "prj_F4XKrsTr5YoN".crm_calendars FOR DELETE USING (true);


--
-- Name: crm_calendars CRM calendars insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendars insertable" ON "prj_F4XKrsTr5YoN".crm_calendars FOR INSERT WITH CHECK (true);


--
-- Name: crm_calendars CRM calendars readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendars readable" ON "prj_F4XKrsTr5YoN".crm_calendars FOR SELECT USING (true);


--
-- Name: crm_calendars CRM calendars updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM calendars updatable" ON "prj_F4XKrsTr5YoN".crm_calendars FOR UPDATE USING (true);


--
-- Name: crm_campaigns CRM campaigns deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM campaigns deletable" ON "prj_F4XKrsTr5YoN".crm_campaigns FOR DELETE USING (true);


--
-- Name: crm_campaigns CRM campaigns insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM campaigns insertable" ON "prj_F4XKrsTr5YoN".crm_campaigns FOR INSERT WITH CHECK (true);


--
-- Name: crm_campaigns CRM campaigns readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM campaigns readable" ON "prj_F4XKrsTr5YoN".crm_campaigns FOR SELECT USING (true);


--
-- Name: crm_campaigns CRM campaigns updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM campaigns updatable" ON "prj_F4XKrsTr5YoN".crm_campaigns FOR UPDATE USING (true);


--
-- Name: crm_contact_lists CRM contact lists deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contact lists deletable" ON "prj_F4XKrsTr5YoN".crm_contact_lists FOR DELETE USING (true);


--
-- Name: crm_contact_lists CRM contact lists insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contact lists insertable" ON "prj_F4XKrsTr5YoN".crm_contact_lists FOR INSERT WITH CHECK (true);


--
-- Name: crm_contact_lists CRM contact lists readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contact lists readable" ON "prj_F4XKrsTr5YoN".crm_contact_lists FOR SELECT USING (true);


--
-- Name: crm_contacts CRM contacts deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contacts deletable" ON "prj_F4XKrsTr5YoN".crm_contacts FOR DELETE USING (true);


--
-- Name: crm_contacts CRM contacts insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contacts insertable" ON "prj_F4XKrsTr5YoN".crm_contacts FOR INSERT WITH CHECK (true);


--
-- Name: crm_contacts CRM contacts readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contacts readable" ON "prj_F4XKrsTr5YoN".crm_contacts FOR SELECT USING (true);


--
-- Name: crm_contacts CRM contacts updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM contacts updatable" ON "prj_F4XKrsTr5YoN".crm_contacts FOR UPDATE USING (true);


--
-- Name: crm_events CRM events insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM events insertable" ON "prj_F4XKrsTr5YoN".crm_events FOR INSERT WITH CHECK (true);


--
-- Name: crm_events CRM events readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM events readable" ON "prj_F4XKrsTr5YoN".crm_events FOR SELECT USING (true);


--
-- Name: crm_flow_logs CRM flow logs insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow logs insertable" ON "prj_F4XKrsTr5YoN".crm_flow_logs FOR INSERT WITH CHECK (true);


--
-- Name: crm_flow_logs CRM flow logs readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow logs readable" ON "prj_F4XKrsTr5YoN".crm_flow_logs FOR SELECT USING (true);


--
-- Name: crm_flow_step_queue CRM flow queue deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow queue deletable" ON "prj_F4XKrsTr5YoN".crm_flow_step_queue FOR DELETE USING (true);


--
-- Name: crm_flow_step_queue CRM flow queue insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow queue insertable" ON "prj_F4XKrsTr5YoN".crm_flow_step_queue FOR INSERT WITH CHECK (true);


--
-- Name: crm_flow_step_queue CRM flow queue readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow queue readable" ON "prj_F4XKrsTr5YoN".crm_flow_step_queue FOR SELECT USING (true);


--
-- Name: crm_flow_step_queue CRM flow queue updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow queue updatable" ON "prj_F4XKrsTr5YoN".crm_flow_step_queue FOR UPDATE USING (true);


--
-- Name: crm_flow_steps CRM flow steps deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow steps deletable" ON "prj_F4XKrsTr5YoN".crm_flow_steps FOR DELETE USING (true);


--
-- Name: crm_flow_steps CRM flow steps insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow steps insertable" ON "prj_F4XKrsTr5YoN".crm_flow_steps FOR INSERT WITH CHECK (true);


--
-- Name: crm_flow_steps CRM flow steps readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow steps readable" ON "prj_F4XKrsTr5YoN".crm_flow_steps FOR SELECT USING (true);


--
-- Name: crm_flow_steps CRM flow steps updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flow steps updatable" ON "prj_F4XKrsTr5YoN".crm_flow_steps FOR UPDATE USING (true);


--
-- Name: crm_flows CRM flows deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flows deletable" ON "prj_F4XKrsTr5YoN".crm_flows FOR DELETE USING (true);


--
-- Name: crm_flows CRM flows insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flows insertable" ON "prj_F4XKrsTr5YoN".crm_flows FOR INSERT WITH CHECK (true);


--
-- Name: crm_flows CRM flows readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flows readable" ON "prj_F4XKrsTr5YoN".crm_flows FOR SELECT USING (true);


--
-- Name: crm_flows CRM flows updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM flows updatable" ON "prj_F4XKrsTr5YoN".crm_flows FOR UPDATE USING (true);


--
-- Name: crm_goal_actions CRM goal actions all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM goal actions all" ON "prj_F4XKrsTr5YoN".crm_goal_actions USING (true) WITH CHECK (true);


--
-- Name: crm_goal_contacts CRM goal contacts all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM goal contacts all" ON "prj_F4XKrsTr5YoN".crm_goal_contacts USING (true) WITH CHECK (true);


--
-- Name: crm_goal_runs CRM goal runs all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM goal runs all" ON "prj_F4XKrsTr5YoN".crm_goal_runs USING (true) WITH CHECK (true);


--
-- Name: crm_goal_work CRM goal work all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM goal work all" ON "prj_F4XKrsTr5YoN".crm_goal_work USING (true) WITH CHECK (true);


--
-- Name: crm_goals CRM goals all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM goals all" ON "prj_F4XKrsTr5YoN".crm_goals USING (true) WITH CHECK (true);


--
-- Name: crm_lists CRM lists deletable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM lists deletable" ON "prj_F4XKrsTr5YoN".crm_lists FOR DELETE USING (true);


--
-- Name: crm_lists CRM lists insertable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM lists insertable" ON "prj_F4XKrsTr5YoN".crm_lists FOR INSERT WITH CHECK (true);


--
-- Name: crm_lists CRM lists readable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM lists readable" ON "prj_F4XKrsTr5YoN".crm_lists FOR SELECT USING (true);


--
-- Name: crm_lists CRM lists updatable; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM lists updatable" ON "prj_F4XKrsTr5YoN".crm_lists FOR UPDATE USING (true);


--
-- Name: crm_opportunities CRM opportunities all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM opportunities all" ON "prj_F4XKrsTr5YoN".crm_opportunities USING (true) WITH CHECK (true);


--
-- Name: crm_opportunity_events CRM opportunity events all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM opportunity events all" ON "prj_F4XKrsTr5YoN".crm_opportunity_events USING (true) WITH CHECK (true);


--
-- Name: crm_pipeline_stages CRM pipeline stages all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM pipeline stages all" ON "prj_F4XKrsTr5YoN".crm_pipeline_stages USING (true) WITH CHECK (true);


--
-- Name: crm_pipelines CRM pipelines all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM pipelines all" ON "prj_F4XKrsTr5YoN".crm_pipelines USING (true) WITH CHECK (true);


--
-- Name: crm_sends CRM sends all; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "CRM sends all" ON "prj_F4XKrsTr5YoN".crm_sends USING (true) WITH CHECK (true);


--
-- Name: crm_calendly_connections Calendly connections service only; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Calendly connections service only" ON "prj_F4XKrsTr5YoN".crm_calendly_connections USING (false) WITH CHECK (false);


--
-- Name: stripe_webhook_events Public can read webhook events; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Public can read webhook events" ON "prj_F4XKrsTr5YoN".stripe_webhook_events FOR SELECT USING (true);


--
-- Name: catches Users can delete own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can delete own catches" ON "prj_F4XKrsTr5YoN".catches FOR DELETE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: favorites Users can delete own favorites; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can delete own favorites" ON "prj_F4XKrsTr5YoN".favorites FOR DELETE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: trips Users can delete own trips; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can delete own trips" ON "prj_F4XKrsTr5YoN".trips FOR DELETE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: catch_log Users can delete their own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can delete their own catches" ON "prj_F4XKrsTr5YoN".catch_log FOR DELETE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: lodging_reviews Users can delete their own reviews; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can delete their own reviews" ON "prj_F4XKrsTr5YoN".lodging_reviews FOR DELETE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: catches Users can insert own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert own catches" ON "prj_F4XKrsTr5YoN".catches FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: favorites Users can insert own favorites; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert own favorites" ON "prj_F4XKrsTr5YoN".favorites FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert own profile" ON "prj_F4XKrsTr5YoN".profiles FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = id));


--
-- Name: subscriptions Users can insert own subscription; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert own subscription" ON "prj_F4XKrsTr5YoN".subscriptions FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: trips Users can insert own trips; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert own trips" ON "prj_F4XKrsTr5YoN".trips FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: catch_log Users can insert their own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can insert their own catches" ON "prj_F4XKrsTr5YoN".catch_log FOR INSERT WITH CHECK (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: trip_checklist_items Users can manage own trip checklist; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can manage own trip checklist" ON "prj_F4XKrsTr5YoN".trip_checklist_items USING ((EXISTS ( SELECT 1
   FROM "prj_F4XKrsTr5YoN".trips
  WHERE ((trips.id = trip_checklist_items.trip_id) AND ((trips.user_id = (NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid) OR (trips.is_shared = true))))));


--
-- Name: catches Users can read own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can read own catches" ON "prj_F4XKrsTr5YoN".catches FOR SELECT USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: subscriptions Users can read own subscription; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can read own subscription" ON "prj_F4XKrsTr5YoN".subscriptions FOR SELECT USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: catches Users can update own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update own catches" ON "prj_F4XKrsTr5YoN".catches FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update own profile" ON "prj_F4XKrsTr5YoN".profiles FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = id));


--
-- Name: subscriptions Users can update own subscription; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update own subscription" ON "prj_F4XKrsTr5YoN".subscriptions FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: trips Users can update own trips; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update own trips" ON "prj_F4XKrsTr5YoN".trips FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: catch_log Users can update their own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update their own catches" ON "prj_F4XKrsTr5YoN".catch_log FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: lodging_reviews Users can update their own reviews; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can update their own reviews" ON "prj_F4XKrsTr5YoN".lodging_reviews FOR UPDATE USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: favorites Users can view own favorites; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can view own favorites" ON "prj_F4XKrsTr5YoN".favorites FOR SELECT USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: trips Users can view own trips; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can view own trips" ON "prj_F4XKrsTr5YoN".trips FOR SELECT USING ((((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id) OR (is_shared = true)));


--
-- Name: catch_log Users can view their own catches; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "Users can view their own catches" ON "prj_F4XKrsTr5YoN".catch_log FOR SELECT USING (((NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text))::uuid = user_id));


--
-- Name: accommodations; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".accommodations ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_autofix_scan_log anyone can read scan log; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "anyone can read scan log" ON "prj_F4XKrsTr5YoN".stripe_autofix_scan_log FOR SELECT USING (true);


--
-- Name: stripe_autofix_schedule anyone can read schedule; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "anyone can read schedule" ON "prj_F4XKrsTr5YoN".stripe_autofix_schedule FOR SELECT USING (true);


--
-- Name: stripe_autofix_scan_log anyone can write scan log; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "anyone can write scan log" ON "prj_F4XKrsTr5YoN".stripe_autofix_scan_log USING (true) WITH CHECK (true);


--
-- Name: stripe_autofix_schedule anyone can write schedule; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY "anyone can write schedule" ON "prj_F4XKrsTr5YoN".stripe_autofix_schedule USING (true) WITH CHECK (true);


--
-- Name: catch_log; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".catch_log ENABLE ROW LEVEL SECURITY;

--
-- Name: catches; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".catches ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_appointments; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_availability; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_calendar_members; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_calendar_members ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_calendars; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_calendly_connections; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_calendly_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_campaigns; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contact_lists; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_contact_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_events; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_events ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_flow_logs; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_flow_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_flow_step_queue; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_flow_step_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_flow_steps; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_flow_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_flows; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_goal_actions; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_goal_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_goal_contacts; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_goal_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_goal_runs; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_goal_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_goal_work; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_goal_work ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_goals; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_lists; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_opportunities; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_opportunity_events; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_opportunity_events ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_pipeline_stages; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_pipelines; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_sends; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".crm_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: fishing_licenses; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".fishing_licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: fishing_regulations; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".fishing_regulations ENABLE ROW LEVEL SECURITY;

--
-- Name: lodging; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".lodging ENABLE ROW LEVEL SECURITY;

--
-- Name: lodging_reviews; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".lodging_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: accommodations public_read_accommodations; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY public_read_accommodations ON "prj_F4XKrsTr5YoN".accommodations FOR SELECT USING (true);


--
-- Name: stripe_autofix_scan_log; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".stripe_autofix_scan_log ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_autofix_schedule; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".stripe_autofix_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".stripe_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events stripe_webhook_events_read; Type: POLICY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

CREATE POLICY stripe_webhook_events_read ON "prj_F4XKrsTr5YoN".stripe_webhook_events FOR SELECT USING (true);


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_checklist_items; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".trip_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: trips; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN".trips ENABLE ROW LEVEL SECURITY;

--
-- Name: users Admin can delete all users; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Admin can delete all users" ON "prj_F4XKrsTr5YoN_auth".users FOR DELETE TO "prj_F4XKrsTr5YoN_role" USING (true);


--
-- Name: identities Admin can delete identities; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Admin can delete identities" ON "prj_F4XKrsTr5YoN_auth".identities FOR DELETE TO "prj_F4XKrsTr5YoN_role" USING (true);


--
-- Name: users Admin can insert users; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Admin can insert users" ON "prj_F4XKrsTr5YoN_auth".users FOR INSERT TO "prj_F4XKrsTr5YoN_role" WITH CHECK (true);


--
-- Name: users Admin can update all users; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Admin can update all users" ON "prj_F4XKrsTr5YoN_auth".users FOR UPDATE TO "prj_F4XKrsTr5YoN_role" USING (true);


--
-- Name: users Admin can view all users; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Admin can view all users" ON "prj_F4XKrsTr5YoN_auth".users FOR SELECT TO "prj_F4XKrsTr5YoN_role" USING (true);


--
-- Name: identities Users can delete own identities; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can delete own identities" ON "prj_F4XKrsTr5YoN_auth".identities FOR DELETE USING ((user_id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: users Users can delete own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can delete own profile" ON "prj_F4XKrsTr5YoN_auth".users FOR DELETE USING ((id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: identities Users can insert own identities; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can insert own identities" ON "prj_F4XKrsTr5YoN_auth".identities FOR INSERT WITH CHECK ((user_id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: users Users can insert own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can insert own profile" ON "prj_F4XKrsTr5YoN_auth".users FOR INSERT WITH CHECK ((id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: identities Users can update own identities; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can update own identities" ON "prj_F4XKrsTr5YoN_auth".identities FOR UPDATE USING ((user_id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: users Users can update own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can update own profile" ON "prj_F4XKrsTr5YoN_auth".users FOR UPDATE USING ((id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: identities Users can view own identities; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can view own identities" ON "prj_F4XKrsTr5YoN_auth".identities FOR SELECT USING ((user_id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: users Users can view own profile; Type: POLICY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

CREATE POLICY "Users can view own profile" ON "prj_F4XKrsTr5YoN_auth".users FOR SELECT USING ((id = "prj_F4XKrsTr5YoN_auth".auth_uid()));


--
-- Name: identities; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN_auth".identities ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN_auth; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN_auth".users ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets Service role can manage buckets; Type: POLICY; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

CREATE POLICY "Service role can manage buckets" ON "prj_F4XKrsTr5YoN_storage".buckets USING (true);


--
-- Name: objects Service role can manage objects; Type: POLICY; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

CREATE POLICY "Service role can manage objects" ON "prj_F4XKrsTr5YoN_storage".objects USING (true);


--
-- Name: buckets; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN_storage".buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: prj_F4XKrsTr5YoN_storage; Owner: -
--

ALTER TABLE "prj_F4XKrsTr5YoN_storage".objects ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


