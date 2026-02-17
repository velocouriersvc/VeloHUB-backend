


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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE SCHEMA IF NOT EXISTS "postgis_ext";


ALTER SCHEMA "postgis_ext" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."attachment_stage_enum" AS ENUM (
    'merchant',
    'pickup',
    'delivery',
    'dispute'
);


ALTER TYPE "public"."attachment_stage_enum" OWNER TO "postgres";


CREATE TYPE "public"."cancelled_by_enum" AS ENUM (
    'buyer',
    'merchant',
    'driver',
    'system'
);


ALTER TYPE "public"."cancelled_by_enum" OWNER TO "postgres";


CREATE TYPE "public"."delivery_type_enum" AS ENUM (
    'standard',
    'express'
);


ALTER TYPE "public"."delivery_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."order_status_enum" AS ENUM (
    'pending',
    'confirmed',
    'preparing_order',
    'ready_for_pickup',
    'driver_assigned',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
    'refunded',
    'pending_payment',
    'paid',
    'awaiting_confirmation'
);


ALTER TYPE "public"."order_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."payment_platform_enum" AS ENUM (
    'paystack',
    'other',
    'cash'
);


ALTER TYPE "public"."payment_platform_enum" OWNER TO "postgres";


CREATE TYPE "public"."payment_status_enum" AS ENUM (
    'pending',
    'held',
    'completed',
    'refunded',
    'initiated',
    'successful',
    'failed'
);


ALTER TYPE "public"."payment_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."recipient_type_enum" AS ENUM (
    'merchant',
    'driver',
    'buyer'
);


ALTER TYPE "public"."recipient_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."ride_status" AS ENUM (
    'pending',
    'searching',
    'accepted',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled',
    'confirmed',
    'awaiting_confirmation',
    'arrived',
    'picked_up',
    'in_transit'
);


ALTER TYPE "public"."ride_status" OWNER TO "postgres";


CREATE TYPE "public"."ride_type_enum" AS ENUM (
    'standard',
    'premium',
    'xl'
);


ALTER TYPE "public"."ride_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."role_enum" AS ENUM (
    'buyer',
    'merchant',
    'driver'
);


ALTER TYPE "public"."role_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."role_enum" IS 'This is the available role options in the whole system';



CREATE TYPE "public"."role_name_enum" AS ENUM (
    'buyer',
    'driver',
    'merchant',
    'admin',
    'system'
);


ALTER TYPE "public"."role_name_enum" OWNER TO "postgres";


CREATE TYPE "public"."transaction_direction_enum" AS ENUM (
    'debit',
    'credit'
);


ALTER TYPE "public"."transaction_direction_enum" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type_enum" AS ENUM (
    'payment',
    'escrow_hold',
    'escrow_release',
    'refund',
    'payout'
);


ALTER TYPE "public"."transaction_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."transfer_status_enum" AS ENUM (
    'pending',
    'success',
    'failed',
    'cancelled'
);


ALTER TYPE "public"."transfer_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."uploaded_by_enum" AS ENUM (
    'buyer',
    'merchant',
    'driver'
);


ALTER TYPE "public"."uploaded_by_enum" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_type_enum" AS ENUM (
    'bike',
    'car',
    'suv',
    'truck'
);


ALTER TYPE "public"."vehicle_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_active_role"("p_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM active_user_role aur
    JOIN roles r ON r.id = aur.role_id
    WHERE aur.profile_id = auth.uid()
      AND r.name = ANY (p_roles)
  ) THEN
    RAISE EXCEPTION 'Insufficient role privileges';
  END IF;
END;
$$;


ALTER FUNCTION "public"."assert_active_role"("p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_driver_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") RETURNS TABLE("id" "uuid", "rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision, "status" "text", "assigned_driver_id" "uuid", "requested_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Lock the ride row
  perform 1
  from rides
  where rides.id = p_ride_id
  for update;

  if not found then
    raise exception 'Ride not found';
  end if;

  -- Ensure ride is available
  if (select rides.status from rides where rides.id = p_ride_id) <> 'searching' then
    raise exception 'Ride is not available for assignment';
  end if;

  -- Assign driver and return lat/lng
  return query
  update rides
  set assigned_driver_id = p_driver_id,
      status = 'assigned'
  where rides.id = p_ride_id
  returning rides.id,
           rides.rider_id,
           ST_Y(rides.pickup::geometry) as pickup_lat,
           ST_X(rides.pickup::geometry) as pickup_lng,
           ST_Y(rides.dropoff::geometry) as dropoff_lat,
           ST_X(rides.dropoff::geometry) as dropoff_lng,
           rides.status,
           rides.assigned_driver_id,
           rides.requested_at;
end;
$$;


ALTER FUNCTION "public"."assign_driver_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_distance_km_inline"("pickup_input" "public"."geography", "dropoff_input" "public"."geography") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  select ST_Distance(pickup_input, dropoff_input) / 1000;
$$;


ALTER FUNCTION "public"."calculate_distance_km_inline"("pickup_input" "public"."geography", "dropoff_input" "public"."geography") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_fare"("p_pickup" "public"."geography", "p_dropoff" "public"."geography", "p_base_fare" numeric DEFAULT 1.60, "p_per_km_rate" numeric DEFAULT 0.90, "p_minimum_fare" numeric DEFAULT 10.00) RETURNS json
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_distance_km NUMERIC;
  v_distance_fee NUMERIC;
  v_subtotal NUMERIC;
  v_surge_multiplier NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Distance
  v_distance_km :=
    ST_Distance(
      p_pickup::geography,
      p_dropoff::geography
    ) / 1000;

  -- Base fare logic
  v_distance_fee := v_distance_km * p_per_km_rate;
  v_subtotal := p_base_fare + v_distance_fee;

  -- Surge
  v_surge_multiplier :=
    calculate_surge_multiplier(
      extract(hour from now())::int,
      1.0
    );

  v_total := v_subtotal * v_surge_multiplier;

  -- Minimum fare
  if v_total < p_minimum_fare then
    v_total := p_minimum_fare;
  end if;

  return json_build_object(
    'base_fare', round(p_base_fare, 2),
    'distance_km', round(v_distance_km, 2),
    'distance_fee', round(v_distance_fee, 2),
    'surge_multiplier', v_surge_multiplier,
    'subtotal', round(v_subtotal, 2),
    'total_fare', round(v_total, 2)
  );
END;$$;


ALTER FUNCTION "public"."calculate_fare"("p_pickup" "public"."geography", "p_dropoff" "public"."geography", "p_base_fare" numeric, "p_per_km_rate" numeric, "p_minimum_fare" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_surge_multiplier"("p_hour" integer, "p_demand_ratio" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_multiplier numeric := 1.0;
begin
  -- Peak hours (example)
  if p_hour between 6 and 9 or p_hour between 16 and 19 then
    v_multiplier := v_multiplier + 0.2;
  end if;

  -- Demand-based surge
  if p_demand_ratio > 1.2 then
    v_multiplier := v_multiplier + 0.2;
  elsif p_demand_ratio > 1.5 then
    v_multiplier := v_multiplier + 0.4;
  end if;

  return v_multiplier;
end;
$$;


ALTER FUNCTION "public"."calculate_surge_multiplier"("p_hour" integer, "p_demand_ratio" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_ride_request"("p_ride_id" "uuid", "p_user_id" "uuid", "p_reason" "text" DEFAULT 'Cancelled by user'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_updated_count int;
    v_status public.ride_status;
BEGIN
    -- 1. Check current status
    SELECT status INTO v_status FROM public.ride_bookings WHERE id = p_ride_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Ride NOT FOUND: ' || p_ride_id::text);
    END IF;

    -- 2. Update the ride status
    UPDATE public.ride_bookings
    SET 
        status = 'cancelled',
        cancelled_at = now(),
        updated_at = now(),
        cancellation_reason = p_reason,
        cancelled_by = p_user_id
    WHERE id = p_ride_id
      AND (buyer_id = p_user_id OR p_user_id IS NULL); -- Ensure only buyer can cancel (or skip check if p_user_id null)
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        -- The transition to cancelled will trigger handle_ride_cancellation() 
        -- which expires notifications automatically.
        RETURN json_build_object('success', true, 'message', 'Ride cancelled successfully');
    ELSE
        RETURN json_build_object('success', false, 'error', 'Update failed. Check permissions for user: ' || p_user_id::text);
    END IF;
END;
$$;


ALTER FUNCTION "public"."cancel_ride_request"("p_ride_id" "uuid", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") RETURNS TABLE("id" "uuid", "rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision, "status" "text", "assigned_driver_id" "uuid", "requested_at" timestamp with time zone, "started_at" timestamp with time zone, "completed_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Lock the ride row
  perform 1
  from rides
  where rides.id = p_ride_id
  for update;

  if not found then
    raise exception 'Ride not found';
  end if;

  if (select rides.assigned_driver_id from rides where rides.id = p_ride_id) <> p_driver_id then
    raise exception 'Driver not assigned to this ride';
  end if;

  if (select rides.status from rides where rides.id = p_ride_id) <> 'in_progress' then
    raise exception 'Ride cannot be completed from current status';
  end if;

  -- Mark as completed
  return query
  update rides
  set status = 'completed',
      completed_at = now()
  where rides.id = p_ride_id
  returning rides.id,
           rides.rider_id,
           ST_Y(rides.pickup::geometry) as pickup_lat,
           ST_X(rides.pickup::geometry) as pickup_lng,
           ST_Y(rides.dropoff::geometry) as dropoff_lat,
           ST_X(rides.dropoff::geometry) as dropoff_lng,
           rides.status,
           rides.assigned_driver_id,
           rides.requested_at,
           rides.started_at,
           rides.completed_at;
end;
$$;


ALTER FUNCTION "public"."complete_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_payment"("p_reference" "text", "p_amount" numeric, "p_provider_response" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_transaction transactions;
  v_order orders;
  v_stock_result jsonb;
BEGIN
  -- Lock and fetch the transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE reference = p_reference
    AND type = 'payment'
  FOR UPDATE;

  -- Check if transaction exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction with reference % not found', p_reference;
  END IF;

  -- Check if already processed
  IF v_transaction.status = 'completed' THEN
    RAISE EXCEPTION 'Transaction % already completed', p_reference
      USING HINT = 'Duplicate webhook or payment already processed';
  END IF;

  -- Verify amount matches
  IF v_transaction.amount != p_amount THEN
    RAISE EXCEPTION 'Amount mismatch. Expected %, got %', 
      v_transaction.amount, p_amount;
  END IF;

  -- Update transaction
  UPDATE transactions
  SET 
    status = 'completed',
    provider_response = p_provider_response,
    updated_at = NOW()
  WHERE id = v_transaction.id;

  -- Get order
  SELECT * INTO v_order
  FROM orders
  WHERE id = v_transaction.order_id
  FOR UPDATE;

  -- Update order status
  UPDATE orders
  SET 
    status = 'paid',
    paid_at = NOW(),
    payment_reference = p_reference,
    updated_at = NOW()
  WHERE id = v_order.id;

  -- Reduce stock
  BEGIN
    v_stock_result := reduce_stock_for_order(v_order.id);
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the payment
    -- You might want to send an alert here
    RAISE WARNING 'Stock reduction failed for order %: %', v_order.id, SQLERRM;
    v_stock_result := jsonb_build_object('error', SQLERRM);
  END;

  -- Return confirmation
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'transaction_id', v_transaction.id,
    'reference', p_reference,
    'amount', v_transaction.amount,
    'stock_reduction', v_stock_result
  );
END;
$$;


ALTER FUNCTION "public"."confirm_payment"("p_reference" "text", "p_amount" numeric, "p_provider_response" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ride"("rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision) RETURNS "uuid"
    LANGUAGE "sql"
    AS $$
insert into rides (rider_id, pickup, dropoff, status)
values (
  rider_id,
  ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography,
  ST_SetSRID(ST_MakePoint(dropoff_lng, dropoff_lat), 4326)::geography,
  'searching'
)
returning id;
$$;


ALTER FUNCTION "public"."create_ride"("rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_wallet"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Insert wallet if it doesn't exist yet
    INSERT INTO public.wallets(user_id, balance, locked_balance, currency, status)
    VALUES (p_user_id, 0, 0, 'GHS', 'active')
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."create_wallet"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update wallets
  set balance = balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_active_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT r.name
  FROM active_user_role aur
  JOIN roles r ON r.id = aur.role_id
  WHERE aur.profile_id = auth.uid();
$$;


ALTER FUNCTION "public"."current_active_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_wallet_balance"("uid" "uuid", "amt" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update wallets
  set balance = balance - amt,
      locked_balance = locked_balance + amt,
      updated_at = now()
  where user_id = uid
    and balance >= amt;
end;
$$;


ALTER FUNCTION "public"."deduct_wallet_balance"("uid" "uuid", "amt" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_ride_notifications"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.ride_request_notifications
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
END;
$$;


ALTER FUNCTION "public"."expire_old_ride_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_wallet_balance"("uid" "uuid", "amt" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
    v_wallet wallets%rowtype;
begin
    select * into v_wallet
    from wallets
    where user_id = uid
    for update;

    if not found then
        raise exception 'Wallet not found for user %', uid;
    end if;

    if v_wallet.locked_balance < amt then
        raise exception 'Locked balance is insufficient to finalize';
    end if;

    update wallets
    set balance = balance - amt,
        locked_balance = locked_balance - amt,
        updated_at = now()
    where id = v_wallet.id;
end;
$$;


ALTER FUNCTION "public"."finalize_wallet_balance"("uid" "uuid", "amt" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geography", "p_service_tier" "text", "p_max_distance_m" integer) RETURNS TABLE("driver_id" "uuid", "distance_m" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select
    d.id as driver_id,
    st_distance(d.last_location, p_pickup) as distance_m
  from drivers d
  where
    d.is_online = true
    and d.service_tier = p_service_tier
    and d.last_location is not null
    and st_dwithin(d.last_location, p_pickup, p_max_distance_m)
  order by distance_m asc;
$$;


ALTER FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geography", "p_service_tier" "text", "p_max_distance_m" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geometry", "p_service_tier" "text", "p_max_distance_m" integer) RETURNS TABLE("driver_id" "uuid", "distance_m" double precision)
    LANGUAGE "sql"
    AS $$
  SELECT
    d.id AS driver_id,
    ST_Distance(d.last_location, p_pickup) AS distance_m
  FROM drivers d
  WHERE
    d.is_online = true
    AND d.service_tier = p_service_tier
    AND d.last_location IS NOT NULL
    AND ST_DWithin(d.last_location, p_pickup, p_max_distance_m)
  ORDER BY distance_m ASC;
$$;


ALTER FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geometry", "p_service_tier" "text", "p_max_distance_m" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_nearby_drivers"("pickup_lat" double precision, "pickup_lng" double precision, "max_distance_m" integer, "vehicle_type" "text" DEFAULT NULL::"text", "service_mode" "text" DEFAULT NULL::"text", "min_last_seen_seconds" integer DEFAULT 60) RETURNS TABLE("driver_id" "uuid", "current_lat" double precision, "current_lng" double precision, "distance_m" double precision, "eta_seconds" integer, "average_rating" numeric, "vehicle_type" "text", "plate_number" "text", "full_name" "text", "service_mode" "text")
    LANGUAGE "sql" STABLE
    AS $$
with pickup as (
  select ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography as geom
)
select 
  d.id as driver_id,
  ST_Y(d.last_location::geometry) as current_lat,
  ST_X(d.last_location::geometry) as current_lng,
  ST_Distance(d.last_location, pickup.geom) as distance_m,
  (ST_Distance(d.last_location, pickup.geom) / 11.11)::integer as eta_seconds, -- ~40 km/h
  d.average_rating,
  d.vehicle_type,
  d.license_plate as plate_number,
  p.full_name,
  d.service_mode
from public.drivers d
join pickup on true
left join public.profiles p on p.id = d.id
where d.is_online = true
  and d.account_status = 'active'
  and d.last_location is not null
  and d.last_location_update >= (now() - make_interval(secs => min_last_seen_seconds))
  and ST_DWithin(d.last_location, pickup.geom, max_distance_m)
  and d.vehicle_type = coalesce(find_nearby_drivers.vehicle_type, d.vehicle_type)
  and (
       d.service_mode = coalesce(find_nearby_drivers.service_mode, d.service_mode)
       or d.service_mode = 'both'
      )
order by distance_m
limit 25;
$$;


ALTER FUNCTION "public"."find_nearby_drivers"("pickup_lat" double precision, "pickup_lng" double precision, "max_distance_m" integer, "vehicle_type" "text", "service_mode" "text", "min_last_seen_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    -- Format: ORD-YYYYMMDD-RANDOM6
    NEW.order_number := 'ORD-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number_value"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Format: ORD-YYYYMMDD-RANDOM6
  RETURN 'ORD-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
END;
$$;


ALTER FUNCTION "public"."generate_order_number_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_user_by_phone"("p_phone" character varying) RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$select id
  from auth.users
  where phone = p_phone
  limit 1;$$;


ALTER FUNCTION "public"."get_auth_user_by_phone"("p_phone" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_result JSONB;
    v_wallet RECORD;
    v_seller_id UUID;
    v_driver_id UUID;
    v_seller_total_earnings NUMERIC := 0;
    v_seller_pending_earnings NUMERIC := 0;
    v_driver_total_earnings NUMERIC := 0;
    v_driver_pending_earnings NUMERIC := 0;
BEGIN
    -- Get wallet (one per user, shared across all roles)
    SELECT 
        id,
        balance,
        locked_balance,
        currency,
        status,
        (balance - locked_balance) as available_balance
    INTO v_wallet
    FROM wallets
    WHERE user_id = p_user_id
    LIMIT 1;

    -- If wallet doesn't exist, create it
    IF NOT FOUND THEN
        INSERT INTO wallets (user_id, balance, locked_balance, currency, status)
        VALUES (p_user_id, 0, 0, 'GHS', 'active')
        ON CONFLICT (user_id) DO NOTHING;
        
        SELECT 
            id,
            balance,
            locked_balance,
            currency,
            status,
            (balance - locked_balance) as available_balance
        INTO v_wallet
        FROM wallets
        WHERE user_id = p_user_id
        LIMIT 1;
    END IF;

    -- Get seller profile ID (if user is a seller)
    SELECT id INTO v_seller_id
    FROM seller_profiles
    WHERE profile_id = p_user_id
    LIMIT 1;

    -- Calculate seller earnings from wallet_transactions
    -- Total earnings = all payout credits from orders
    -- Pending earnings = payout credits from orders that aren't delivered yet
    IF v_seller_id IS NOT NULL THEN
        SELECT 
            COALESCE(SUM(wt.amount), 0)::numeric
        INTO v_seller_total_earnings
        FROM wallet_transactions wt
        JOIN wallets w ON w.id = wt.wallet_id
        WHERE w.user_id = p_user_id
        AND wt.type = 'payout'
        AND wt.direction = 'credit'
        AND wt.reference_type = 'order';

        SELECT 
            COALESCE(SUM(wt.amount), 0)::numeric
        INTO v_seller_pending_earnings
        FROM wallet_transactions wt
        JOIN wallets w ON w.id = wt.wallet_id
        JOIN orders o ON o.id = wt.reference_id
        WHERE w.user_id = p_user_id
        AND wt.type = 'payout'
        AND wt.direction = 'credit'
        AND wt.reference_type = 'order'
        AND o.status != 'delivered';
    END IF;

    -- Get driver profile ID (if user is a driver)
    -- Drivers table uses id (same as profiles.id) which references profiles(id)
    SELECT id INTO v_driver_id
    FROM drivers
    WHERE id = p_user_id
    LIMIT 1;

    -- Calculate driver earnings from wallet_transactions
    IF v_driver_id IS NOT NULL THEN
        SELECT 
            COALESCE(SUM(wt.amount), 0)::numeric
        INTO v_driver_total_earnings
        FROM wallet_transactions wt
        JOIN wallets w ON w.id = wt.wallet_id
        WHERE w.user_id = p_user_id
        AND wt.type = 'payout'
        AND wt.direction = 'credit'
        AND wt.reference_type = 'order';

        SELECT 
            COALESCE(SUM(wt.amount), 0)::numeric
        INTO v_driver_pending_earnings
        FROM wallet_transactions wt
        JOIN wallets w ON w.id = wt.wallet_id
        JOIN orders o ON o.id = wt.reference_id
        WHERE w.user_id = p_user_id
        AND wt.type = 'payout'
        AND wt.direction = 'credit'
        AND wt.reference_type = 'order'
        AND o.status != 'delivered';
    END IF;

    -- Build result JSON
    v_result := jsonb_build_object(
        'wallet', jsonb_build_object(
            'id', v_wallet.id,
            'balance', COALESCE(v_wallet.balance, 0),
            'locked_balance', COALESCE(v_wallet.locked_balance, 0),
            'available_balance', COALESCE(v_wallet.available_balance, 0),
            'currency', COALESCE(v_wallet.currency, 'GHS'),
            'status', COALESCE(v_wallet.status, 'active')
        ),
        'seller', CASE 
            WHEN v_seller_id IS NOT NULL THEN
                jsonb_build_object(
                    'id', v_seller_id,
                    'total_earnings', v_seller_total_earnings,
                    'pending_earnings', v_seller_pending_earnings,
                    'available_earnings', (v_seller_total_earnings - v_seller_pending_earnings),
                    'total_available', ((v_seller_total_earnings - v_seller_pending_earnings) + COALESCE(v_wallet.available_balance, 0))
                )
            ELSE NULL
        END,
        'driver', CASE 
            WHEN v_driver_id IS NOT NULL THEN
                jsonb_build_object(
                    'id', v_driver_id,
                    'total_earnings', v_driver_total_earnings,
                    'pending_earnings', v_driver_pending_earnings,
                    'available_earnings', (v_driver_total_earnings - v_driver_pending_earnings),
                    'total_available', ((v_driver_total_earnings - v_driver_pending_earnings) + COALESCE(v_wallet.available_balance, 0))
                )
            ELSE NULL
        END,
        'customer', jsonb_build_object(
            'wallet_balance', COALESCE(v_wallet.available_balance, 0)
        )
    );

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") IS 'Returns wallet balance and role-specific earnings (seller/driver) for a user. Earnings calculated from wallet_transactions. Wallet is shared across all roles, but earnings are tracked separately per role. Uses drivers table (not driver_profiles). Pending earnings are for orders not yet delivered.';



CREATE OR REPLACE FUNCTION "public"."handle_new_profile_buyer_info"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.buyer_information (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_profile_buyer_info"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ride_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Log for debugging
  RAISE NOTICE 'Trigger fired: OLD.status=%, NEW.status=%, NEW.driver_id=%', OLD.status, NEW.status, NEW.driver_id;
  
  -- If a driver accepted, update the ride booking and mark other notifications as expired
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    RAISE NOTICE 'Updating ride_bookings for ride_request_id=% with driver_id=%', NEW.ride_request_id, NEW.driver_id;
    
    -- Update the ride booking with the driver
    UPDATE public.ride_bookings
    SET 
      driver_id = NEW.driver_id,
      status = 'accepted',
      accepted_at = now()
    WHERE id = NEW.ride_request_id
      AND driver_id IS NULL; -- Only if not already assigned
    
    RAISE NOTICE 'Updated % rows in ride_bookings', FOUND;
    
    -- Mark all other pending notifications for this ride as expired
    UPDATE public.ride_request_notifications
    SET status = 'expired'
    WHERE ride_request_id = NEW.ride_request_id
      AND id != NEW.id
      AND status = 'pending';
      
    -- Set responded_at
    NEW.responded_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ride_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ride_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- If the ride status is changed to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Mark all pending notifications for this ride as expired
    UPDATE public.ride_request_notifications
    SET status = 'expired'
    WHERE ride_request_id = NEW.id
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ride_cancellation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hello_world"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return 'Hello, ' || name || '!';
end;
$$;


ALTER FUNCTION "public"."hello_world"("name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + p_amount,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_payout"("p_user_id" "uuid", "p_amount" numeric, "p_recipient_type" "text") RETURNS TABLE("payout_id" "uuid", "wallet_id" "uuid", "reference" "text")
    LANGUAGE "plpgsql"
    AS $$declare
  v_wallet wallets%rowtype;
  v_reference text := 'payout_' || gen_random_uuid();
begin
  -- Lock wallet row
  select * into v_wallet
  from wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Deduct balance
  update wallets
  set balance = balance - p_amount
  where id = v_wallet.id;

  -- Create payout
  insert into payout_requests (
    user_id,
    wallet_id,
    amount,
    recipient_type,
    reference,
    status
  )
  values (
    p_user_id,
    v_wallet.id,
    p_amount,
    p_recipient_type,
    v_reference,
    'pending'
  )
  returning id, wallet_id, reference
  into payout_id, wallet_id, reference;

  return next;
end;$$;


ALTER FUNCTION "public"."init_payout"("p_user_id" "uuid", "p_amount" numeric, "p_recipient_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_wallet_balance"("wallet_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.wallets
  SET locked_balance = locked_balance + amount,
      updated_at = now()
  WHERE id = wallet_id
    AND (balance - locked_balance) >= amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;
END;
$$;


ALTER FUNCTION "public"."lock_wallet_balance"("wallet_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_log(order_id, old_status, new_status, changed_by, changed_at)
    VALUES (OLD.id, OLD.status, NEW.status, current_setting('jwt.claims.user_id', true)::uuid, NOW());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merchant_update_order"("p_order_id" "uuid", "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  -- Check if order exists
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order does not exist';
  END IF;

  -- Only allow transition from awaiting_confirmation
  IF (SELECT status FROM orders WHERE id = p_order_id) != 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'Order not awaiting confirmation';
  END IF;

  IF p_action = 'accept' THEN
    UPDATE orders
    SET status = 'confirmed',
        updated_at = now()
    WHERE id = p_order_id;

  ELSIF p_action = 'reject' THEN
    UPDATE orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = 'merchant',
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;$$;


ALTER FUNCTION "public"."merchant_update_order"("p_order_id" "uuid", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_requires_delivery" boolean, "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "public"."delivery_type_enum", "p_promo_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_subtotal numeric := 0;
    v_service_fee numeric := 0;
    v_delivery_fee numeric := 0;
    v_discount numeric := 0;
    v_total numeric := 0;
    v_distance numeric := 0;
    v_merchant_id uuid;
    v_items jsonb := '[]'::jsonb;
    v_item jsonb;
    v_product RECORD;
    v_promo RECORD;
    v_merchant RECORD;
BEGIN
    -- Validate items
    IF jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('error','No items provided');
    END IF;

    -- Loop through items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product
        FROM products
        WHERE id = (v_item->>'product_id')::uuid;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('error','Product '||(v_item->>'product_id')||' not found');
        END IF;

        IF NOT v_product.is_available THEN
            RETURN jsonb_build_object('error','Product '||v_product.name||' is not available');
        END IF;

        IF v_product.stock_quantity < (v_item->>'quantity')::int THEN
            RETURN jsonb_build_object('error','Insufficient stock for '||v_product.name);
        END IF;

        -- Merchant consistency
        IF v_merchant_id IS NULL THEN
            v_merchant_id := v_product.merchant_id;
        ELSIF v_merchant_id <> v_product.merchant_id THEN
            RETURN jsonb_build_object('error','All products must belong to the same merchant');
        END IF;

        -- Subtotal
        v_subtotal := v_subtotal + v_product.price * (v_item->>'quantity')::int;

        -- Build item breakdown
        v_items := v_items || jsonb_build_object(
            'product_id', v_product.id,
            'name', v_product.name,
            'unit_price', v_product.price,
            'quantity', (v_item->>'quantity')::int,
            'total_price', v_product.price * (v_item->>'quantity')::int
        );
    END LOOP;

    -- Service fee
    v_service_fee := round(v_subtotal * 0.05, 2);

    -- Delivery fee
    IF p_requires_delivery THEN
        SELECT business_lat, business_lng INTO v_merchant
        FROM merchants WHERE id = v_merchant_id;

        v_distance := 6371 * acos(
            cos(radians(p_delivery_lat)) * cos(radians(v_merchant.business_lat)) *
            cos(radians(v_merchant.business_lng) - radians(p_delivery_lng)) +
            sin(radians(p_delivery_lat)) * sin(radians(v_merchant.business_lat))
        );

        IF p_delivery_type = 'express' THEN
            v_delivery_fee := round(10 + v_distance * 3, 2);
        ELSE
            v_delivery_fee := round(5 + v_distance * 2, 2);
        END IF;
    END IF;

    -- Promo code
    IF p_promo_code IS NOT NULL THEN
        SELECT * INTO v_promo
        FROM promotions
        WHERE code = p_promo_code AND active = true;

        IF FOUND THEN
            v_discount := round((v_subtotal + v_service_fee + v_delivery_fee) * v_promo.amount / 100, 2);
        ELSE
            RETURN jsonb_build_object('error','Promo code '||p_promo_code||' not found or inactive');
        END IF;
    END IF;

    -- Total
    v_total := v_subtotal + v_service_fee + v_delivery_fee - v_discount;

    RETURN jsonb_build_object(
        'buyer_id', p_buyer_id,
        'merchant_id', v_merchant_id,
        'requires_delivery', p_requires_delivery,
        'delivery_type', p_delivery_type,
        'distance_km', round(v_distance, 2),
        'subtotal', v_subtotal,
        'service_fee', v_service_fee,
        'delivery_fee_estimate', v_delivery_fee,
        'discount_amount', v_discount,
        'total_estimate', v_total,
        'currency', 'GHS',
        'expires_in_seconds', 300,
        'items', v_items
    );
END;
$$;


ALTER FUNCTION "public"."order_quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_requires_delivery" boolean, "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "public"."delivery_type_enum", "p_promo_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."paystack_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "wallet_transaction_id" "uuid",
    "recipient_code" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency" "text" NOT NULL,
    "reason" "text",
    "status" "public"."transfer_status_enum" DEFAULT 'pending'::"public"."transfer_status_enum" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "transfer_code" "text",
    "external_reference" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "paystack_transfers_currency_check" CHECK (("currency" = ANY (ARRAY['NGN'::"text", 'GHS'::"text", 'KES'::"text", 'ZAR'::"text"])))
);


ALTER TABLE "public"."paystack_transfers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_attach_transfer_code"("p_idempotency_key" "text", "p_transfer_code" "text", "p_external_reference" "text" DEFAULT NULL::"text") RETURNS "public"."paystack_transfers"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update paystack_transfers
    set transfer_code = coalesce(transfer_code, p_transfer_code),
        external_reference = coalesce(external_reference, p_external_reference),
        updated_at = now()
  where idempotency_key = p_idempotency_key
  returning *;
$$;


ALTER FUNCTION "public"."payout_attach_transfer_code"("p_idempotency_key" "text", "p_transfer_code" "text", "p_external_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_finalize_failed"("p_transfer_code" "text", "p_webhook" "jsonb") RETURNS "public"."paystack_transfers"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_tr paystack_transfers;
  v_wallet wallets;
  v_recipient paystack_recipients;
begin
  -- Lock transfer row
  select * into v_tr
  from paystack_transfers
  where transfer_code = p_transfer_code
  for update;

  if v_tr.id is null then
    raise exception 'Transfer not found';
  end if;

  -- Validate recipient
  select * into v_recipient
  from paystack_recipients
  where recipient_code = v_tr.recipient_code
    and status = 'active'
    and currency = v_tr.currency
  limit 1;

  if v_recipient.id is null then
    raise exception 'Recipient mismatch or inactive';
  end if;

  -- Idempotency check
  if v_tr.status = 'failed' then
    return v_tr;
  end if;

  -- Lock wallet row
  select * into v_wallet
  from wallets
  where id = v_tr.wallet_id
  for update;

  -- Refund locked funds back to balance
  update wallets
    set locked_balance = locked_balance - v_tr.amount,
        balance = balance + v_tr.amount,
        updated_at = now()
  where id = v_tr.wallet_id;

  -- Log refund transaction
  insert into wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    v_tr.wallet_id, 'credit', 'escrow_release', v_tr.amount,
    v_wallet.balance, v_wallet.balance + v_tr.amount,
    'payout', v_tr.id, v_tr.transfer_code,
    jsonb_build_object('webhook', p_webhook)
  );

  -- Update transfer record
  update paystack_transfers
    set status = 'failed',
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('webhook', p_webhook)
  where id = v_tr.id;

  return (select * from paystack_transfers where id = v_tr.id);
end;
$$;


ALTER FUNCTION "public"."payout_finalize_failed"("p_transfer_code" "text", "p_webhook" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_finalize_success"("p_transfer_code" "text", "p_webhook" "jsonb") RETURNS "public"."paystack_transfers"
    LANGUAGE "plpgsql"
    AS $$declare
  v_tr paystack_transfers;
  v_wallet wallets;
  v_recipient paystack_recipients;
begin
  -- Lock transfer row
  select * into v_tr
  from paystack_transfers
  where transfer_code = p_transfer_code
  for update;

  if v_tr.id is null then
    raise exception 'Transfer not found';
  end if;

  -- Validate recipient
  select * into v_recipient
  from paystack_recipients
  where recipient_code = v_tr.recipient_code
    and status = 'active'
    and currency = v_tr.currency
  limit 1;

  if v_recipient.id is null then
    raise exception 'Recipient mismatch or inactive';
  end if;

  -- Idempotency check
  if v_tr.status = 'success' then
    return v_tr;
  end if;

  -- Lock wallet row
  select * into v_wallet
  from wallets
  where id = v_tr.wallet_id
  for update;

  -- Release locked funds permanently
  update wallets
    set locked_balance = locked_balance - v_tr.amount,
        updated_at = now()
  where id = v_tr.wallet_id;

  -- Log payout transaction
  insert into wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    v_tr.wallet_id, 'debit', 'payout', v_tr.amount,
    v_wallet.balance, v_wallet.balance,
    'payout', v_tr.id, v_tr.transfer_code,
    jsonb_build_object('webhook', p_webhook)
  );

  -- Update transfer record
  update paystack_transfers
    set status = 'success',
        completed_at = now(),
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('webhook', p_webhook)
  where id = v_tr.id;

  return v_tr;
end;$$;


ALTER FUNCTION "public"."payout_finalize_success"("p_transfer_code" "text", "p_webhook" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_initiate"("p_wallet_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_recipient_code" "text", "p_reason" "text", "p_idempotency_key" "text", "p_meta" "jsonb") RETURNS "public"."paystack_transfers"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_wallet wallets;
  v_existing paystack_transfers;
  v_recipient paystack_recipients;
  v_tx wallet_transactions;
begin
  -- Idempotency check
  select * into v_existing
  from paystack_transfers
  where idempotency_key = p_idempotency_key
  limit 1;
  if v_existing.id is not null then
    return v_existing;
  end if;

  -- Lock wallet row
  select * into v_wallet
  from wallets
  where id = p_wallet_id
  for update;
  if v_wallet.id is null then
    raise exception 'Wallet not found';
  end if;
  if v_wallet.currency <> p_currency then
    raise exception 'Currency mismatch';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if v_wallet.balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Validate recipient
  select * into v_recipient
  from paystack_recipients
  where recipient_code = p_recipient_code
    and status = 'active'          -- ✅ fixed
    and currency = p_currency      -- ✅ new column
  limit 1;
  if v_recipient.id is null then
    raise exception 'Recipient not found or inactive';
  end if;

  -- Reserve funds
  update wallets
    set balance = balance - p_amount,
        locked_balance = locked_balance + p_amount,
        updated_at = now()
  where id = p_wallet_id;

  -- Log wallet transaction
  insert into wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    p_wallet_id, 'debit', 'escrow_hold', p_amount,
    v_wallet.balance, v_wallet.balance - p_amount,
    'payout', gen_random_uuid(), null, p_meta
  )
  returning * into v_tx;

  -- Create transfer record
  insert into paystack_transfers (
    wallet_id, wallet_transaction_id, recipient_code, amount, currency,
    reason, status, idempotency_key, metadata
  )
  values (
    p_wallet_id, v_tx.id, p_recipient_code, p_amount, p_currency,
    p_reason, 'pending', p_idempotency_key, p_meta
  )
  returning * into v_existing;

  return v_existing;
end;
$$;


ALTER FUNCTION "public"."payout_initiate"("p_wallet_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_recipient_code" "text", "p_reason" "text", "p_idempotency_key" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_tx"("p_buyer_id" "uuid", "p_quote" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_order orders;
  v_delivery_fee numeric;
  v_pickup_code text;
  v_delivery_code text;
begin
  if p_quote is null then
    raise exception 'Order placement failed: quote is missing';
  end if;

  v_delivery_fee := (p_quote->>'delivery_fee')::numeric;
  
  if v_delivery_fee is null then
    raise exception 'Order placement failed: delivery_fee is missing from quote.';
  end if;

  v_pickup_code := (floor(random() * 900000) + 100000)::text;
  v_delivery_code := (floor(random() * 900000) + 100000)::text;

  insert into orders (
    order_number, buyer_id, merchant_id,
    subtotal, service_fee, delivery_fee, discount_amount,
    total_major, total_minor, escrow_amount,
    delivery_lat, delivery_lng, pickup_lat, pickup_lng, delivery_type,
    pickup_code, delivery_code, pricing_snapshot, status
  )
  values (
    generate_order_number_value(),
    p_buyer_id,
    (p_quote->>'merchant_id')::uuid,
    (p_quote->>'subtotal')::numeric,
    coalesce((p_quote->>'service_fee')::numeric, 0),
    v_delivery_fee,
    coalesce((p_quote->>'discount_amount')::numeric, 0),
    (p_quote->>'total_major')::numeric,
    (p_quote->>'total_minor')::int,
    (p_quote->>'total_minor')::int,
    (p_quote->>'delivery_lat')::numeric,
    (p_quote->>'delivery_lng')::numeric,
    (p_quote->>'merchant_lat')::numeric,
    (p_quote->>'merchant_lng')::numeric,
    coalesce((p_quote->>'delivery_type')::text, 'standard')::public.delivery_type_enum,
    v_pickup_code, v_delivery_code, p_quote, 'pending_payment'
  )
  returning * into v_order;

  insert into order_items (
    order_id, merchant_id, product_id, product_name, product_description,
    unit_price, quantity, total_price, customizations
  )
  select
    v_order.id,
    v_order.merchant_id,
    (item->>'product_id')::uuid,
    (item->>'name'),
    coalesce(item->>'description', ''),
    (item->>'price')::numeric,
    (item->>'quantity')::int,
    ((item->>'price')::numeric * (item->>'quantity')::int),
    (item->'customizations')
  from jsonb_array_elements(p_quote->'items') as item;

  return row_to_json(v_order);
end;
$$;


ALTER FUNCTION "public"."place_order_tx"("p_buyer_id" "uuid", "p_quote" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_transaction_split"("p_tx_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    -- Locked transaction
    v_tx RECORD;

    -- Order values
    v_subtotal NUMERIC := 0;
    v_delivery_fee NUMERIC := 0;
    v_discount NUMERIC := 0;

    -- Buyer fee
    v_buyer_service_fee NUMERIC := 0;

    -- Merchant breakdown
    v_merchant_service_fee NUMERIC := 0;
    v_merchant_commission NUMERIC := 0;
    v_merchant_amount NUMERIC := 0;

    -- Driver breakdown
    v_driver_service_fee NUMERIC := 0;
    v_driver_commission NUMERIC := 0;
    v_driver_amount NUMERIC := 0;

    -- Platform
    v_platform_amount NUMERIC := 0;

    -- Expected total
    v_expected_total NUMERIC := 0;
BEGIN
    -- -------------------------------------------------
    -- Lock transaction row
    -- -------------------------------------------------
    SELECT *
    INTO v_tx
    FROM public.transactions
    WHERE id = p_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_tx_id;
    END IF;

    -- -------------------------------------------------
    -- Fetch order financials
    -- -------------------------------------------------
    SELECT
        subtotal,
        delivery_fee,
        COALESCE(discount_amount, 0)
    INTO
        v_subtotal,
        v_delivery_fee,
        v_discount
    FROM public.orders
    WHERE id = v_tx.order_id;

    -- -------------------------------------------------
    -- Buyer service fee (5% of subtotal + delivery)
    -- -------------------------------------------------
    v_buyer_service_fee :=
        ROUND((v_subtotal + v_delivery_fee) * 0.05, 2);

    -- -------------------------------------------------
    -- Merchant calculations (on product subtotal)
    -- -------------------------------------------------
    v_merchant_service_fee :=
        ROUND(v_subtotal * 0.05, 2);

    v_merchant_commission :=
        ROUND(v_subtotal * 0.15, 2);

    v_merchant_amount :=
        ROUND(
            v_subtotal
            - v_merchant_service_fee
            - v_merchant_commission,
        2);

    -- -------------------------------------------------
    -- Driver calculations (on delivery fee)
    -- -------------------------------------------------
    v_driver_service_fee :=
        ROUND(v_delivery_fee * 0.05, 2);

    v_driver_commission :=
        ROUND(v_delivery_fee * 0.15, 2);

    v_driver_amount :=
        ROUND(
            v_delivery_fee
            - v_driver_service_fee
            - v_driver_commission,
        2);

    -- -------------------------------------------------
    -- Platform calculation
    -- Platform absorbs discount
    -- -------------------------------------------------
    v_platform_amount :=
        ROUND(
            v_buyer_service_fee
            + v_merchant_service_fee
            + v_merchant_commission
            + v_driver_service_fee
            + v_driver_commission
            - v_discount,
        2);

    -- -------------------------------------------------
    -- Final integrity reconciliation
    -- -------------------------------------------------
    v_expected_total := v_tx.amount;

    IF (v_merchant_amount + v_driver_amount + v_platform_amount)
        <> v_expected_total
    THEN
        -- Platform absorbs rounding difference
        v_platform_amount :=
            v_expected_total
            - (v_merchant_amount + v_driver_amount);
    END IF;

    -- -------------------------------------------------
    -- Update transaction
    -- -------------------------------------------------
    UPDATE public.transactions
    SET
        merchant_amount = v_merchant_amount,
        driver_amount = v_driver_amount,
        platform_amount = v_platform_amount,
        status = 'successful',
        updated_at = now()
    WHERE id = p_tx_id;

END;
$$;


ALTER FUNCTION "public"."process_transaction_split"("p_tx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_transaction_split-old"("p_tx_id" "uuid") RETURNS TABLE("merchant_amount" numeric, "driver_amount" numeric, "platform_amount" numeric)
    LANGUAGE "plpgsql"
    AS $$-- DECLARE











DECLARE
    v_tx RECORD;
    v_order RECORD;

    v_subtotal NUMERIC;
    v_delivery_fee NUMERIC;

    v_buyer_service_fee NUMERIC;

    v_merchant_service_fee NUMERIC;
    v_merchant_commission NUMERIC;
    v_merchant_amount NUMERIC;

    v_driver_service_fee NUMERIC;
    v_driver_commission NUMERIC;
    v_driver_amount NUMERIC;

    v_platform_amount NUMERIC;
BEGIN
    -- -------------------------------------------------
    -- Lock transaction row
    -- -------------------------------------------------
    SELECT *
    INTO v_tx
    FROM public.transactions
    WHERE id = p_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    -- -------------------------------------------------
    -- Fetch order amounts
    -- -------------------------------------------------
    SELECT subtotal, delivery_fee
    INTO v_subtotal, v_delivery_fee
    FROM public.orders
    WHERE id = v_tx.order_id;

    -- -------------------------------------------------
    -- Buyer service fee (5% of subtotal + delivery)
    -- -------------------------------------------------
    v_buyer_service_fee :=
        ROUND((v_subtotal + v_delivery_fee) * 0.05, 2);

    -- -------------------------------------------------
    -- Merchant calculations (on product subtotal)
    -- -------------------------------------------------
    v_merchant_service_fee :=
        ROUND(v_subtotal * 0.05, 2);

    v_merchant_commission :=
        ROUND(v_subtotal * 0.15, 2);

    v_merchant_amount :=
        ROUND(
            v_subtotal
            - v_merchant_service_fee
            - v_merchant_commission,
        2);

    -- -------------------------------------------------
    -- Driver calculations (on delivery fee)
    -- -------------------------------------------------
    v_driver_service_fee :=
        ROUND(v_delivery_fee * 0.05, 2);

    v_driver_commission :=
        ROUND(v_delivery_fee * 0.15, 2);

    v_driver_amount :=
        ROUND(
            v_delivery_fee
            - v_driver_service_fee
            - v_driver_commission,
        2);

    -- -------------------------------------------------
    -- Platform calculations
    -- -------------------------------------------------
    v_platform_amount :=
        ROUND(
            v_buyer_service_fee
            + v_merchant_service_fee
            + v_merchant_commission
            + v_driver_service_fee
            + v_driver_commission,
        2);

    -- -------------------------------------------------
    -- Integrity check (must equal total paid by buyer)
    -- -------------------------------------------------
    IF (v_merchant_amount + v_driver_amount + v_platform_amount)
        <> (v_subtotal + v_delivery_fee + v_buyer_service_fee)
    THEN
        -- Platform absorbs rounding differences
        v_platform_amount :=
            (v_subtotal + v_delivery_fee + v_buyer_service_fee)
            - (v_merchant_amount + v_driver_amount);
    END IF;

    -- -------------------------------------------------
    -- Update transaction
    -- -------------------------------------------------
    UPDATE public.transactions
    SET
        merchant_amount = v_merchant_amount,
        driver_amount = v_driver_amount,
        platform_amount = v_platform_amount,
        status = 'successful',
        updated_at = now()
    WHERE id = p_tx_id;

    RETURN NEXT;
END;$$;


ALTER FUNCTION "public"."process_transaction_split-old"("p_tx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_subtotal numeric := 0;
    v_service_fee numeric := 0;
    v_delivery_fee numeric := 0;
    v_discount numeric := 0;
    v_total numeric := 0;
    v_distance numeric := 0;

    v_merchant_id uuid;
    v_processed_items jsonb := '[]'::jsonb;

    v_item jsonb;
    v_product record;
    v_promo record;
    v_merchant record;
    
    -- Customization summing variables
    v_customizations jsonb;
    v_customization_price numeric := 0;
    v_option jsonb;
    v_unit_price numeric := 0;
begin
    ------------------------------------------------------------------
    -- VALIDATE ITEMS
    ------------------------------------------------------------------
    if p_items is null or jsonb_array_length(p_items) = 0 then
        return jsonb_build_object('error', 'No items provided');
    end if;

    ------------------------------------------------------------------
    -- MERCHANT & SUBTOTAL CALCULATION
    ------------------------------------------------------------------
    for v_item in select * from jsonb_array_elements(p_items) loop
        -- 1. Get base product
        select * into v_product
        from products
        where id = (v_item->>'product_id')::uuid;

        if not found then
            return jsonb_build_object('error', 'Product ' || (v_item->>'product_id') || ' not found');
        end if;

        -- 2. Multi-merchant check
        if v_merchant_id is null then
            v_merchant_id := v_product.merchant_id;
        elsif v_merchant_id <> v_product.merchant_id then
            return jsonb_build_object('error', 'All products must belong to the same merchant');
        end if;

        -- 3. Calculate customization price for THIS item
        v_customizations := v_item->'customizations';
        v_customization_price := 0;
        
        if v_customizations is not null then
            -- Proteins
            if v_customizations ? 'proteins' then
                for v_option in select * from jsonb_array_elements(v_customizations->'proteins') loop
                    v_customization_price := v_customization_price + coalesce((v_option->>'price')::numeric, 0);
                end loop;
            end if;
            -- Extras
            if v_customizations ? 'extras' then
                for v_option in select * from jsonb_array_elements(v_customizations->'extras') loop
                    v_customization_price := v_customization_price + coalesce((v_option->>'price')::numeric, 0);
                end loop;
            end if;
            -- Drinks
            if v_customizations ? 'drinks' then
                for v_option in select * from jsonb_array_elements(v_customizations->'drinks') loop
                    v_customization_price := v_customization_price + coalesce((v_option->>'price')::numeric, 0);
                end loop;
            end if;
            -- Sides
            if v_customizations ? 'sides' then
                for v_option in select * from jsonb_array_elements(v_customizations->'sides') loop
                    v_customization_price := v_customization_price + coalesce((v_option->>'price')::numeric, 0);
                end loop;
            end if;
        end if;

        v_unit_price := v_product.price + v_customization_price;
        v_subtotal := v_subtotal + (v_unit_price * (v_item->>'quantity')::int);

        v_processed_items := v_processed_items || jsonb_build_object(
            'product_id', v_product.id,
            'name', v_product.name,
            'base_price', v_product.price,
            'customization_price', v_customization_price,
            'price', v_unit_price, -- This is the full price used for total calculation
            'quantity', (v_item->>'quantity')::int,
            'customizations', v_customizations
        );
    end loop;

    ------------------------------------------------------------------
    -- CHARGES
    ------------------------------------------------------------------
    -- Fixed nominal service fee (e.g., 5%)
    v_service_fee := round(v_subtotal * 0.05, 2);

    -- Delivery Distance Calculation
    select business_lat, business_lng
    into v_merchant
    from merchants
    where id = v_merchant_id;

    if not found then
        return jsonb_build_object('error', 'Merchant not found');
    end if;

    -- Haversine distance (km) with NULL protection
    if p_delivery_lat is not null and p_delivery_lng is not null 
       and v_merchant.business_lat is not null and v_merchant.business_lng is not null then
        begin
            v_distance := 6371 * acos(
                least(1.0, greatest(-1.0, 
                    cos(radians(p_delivery_lat))
                    * cos(radians(v_merchant.business_lat))
                    * cos(radians(v_merchant.business_lng) - radians(p_delivery_lng))
                    + sin(radians(p_delivery_lat))
                    * sin(radians(v_merchant.business_lat))
                ))
            );
        exception when others then
            v_distance := 5;
        end;
    else
        v_distance := 5;
    end if;

    if p_delivery_type = 'express' then
        v_delivery_fee := round(10 + coalesce(v_distance, 5) * 3, 2);
    elsif p_delivery_type = 'pickup' then
        v_delivery_fee := 0;
    else
        v_delivery_fee := round(5 + coalesce(v_distance, 5) * 2, 2);
    end if;

    ------------------------------------------------------------------
    -- PROMO CODE (OPTIONAL)
    ------------------------------------------------------------------
    if p_promo_code is not null and p_promo_code != '' then
        select * into v_promo
        from promotions
        where code = p_promo_code and active = true;

        if found then
           if v_promo.discount_type = 'percent' then
                v_discount := round((v_subtotal + v_service_fee + v_delivery_fee) * v_promo.discount_value / 100, 2);
           else
                v_discount := v_promo.discount_value;
           end if;
        end if;
    end if;

    ------------------------------------------------------------------
    -- FINAL TOTAL
    ------------------------------------------------------------------
    v_total := v_subtotal + v_service_fee + v_delivery_fee - v_discount;
    if v_total < 0 then v_total := 0; end if;

    ------------------------------------------------------------------
    -- RETURN PRICING SNAPSHOT
    ------------------------------------------------------------------
    return jsonb_build_object(
        'buyer_id', p_buyer_id,
        'merchant_id', v_merchant_id,
        'delivery_type', p_delivery_type,
        'delivery_lat', coalesce(p_delivery_lat, 0),
        'delivery_lng', coalesce(p_delivery_lng, 0),
        'merchant_lat', coalesce(v_merchant.business_lat, 0),
        'merchant_lng', coalesce(v_merchant.business_lng, 0),
        'distance_km', round(coalesce(v_distance, 0), 2),

        'subtotal', v_subtotal,
        'service_fee', v_service_fee,
        'delivery_fee', v_delivery_fee,
        'discount_amount', v_discount,

        'total_major', round(v_total, 2),
        'total_minor', (round(v_total, 2) * 100)::int,
        'currency', 'GHS',

        'expires_in_seconds', 300,
        'items', v_processed_items,
        'customizations_applied', true
    );
end;
$$;


ALTER FUNCTION "public"."quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote-1"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$DECLARE
    v_subtotal NUMERIC := 0;
    v_delivery_fee NUMERIC := 0;
    v_service_fee NUMERIC := 0;
    v_discount NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_product_price NUMERIC;
    v_product_name TEXT;
    v_merchant_id UUID;
    v_processed_items JSONB := '[]'::JSONB;
    v_promo_type TEXT;
    v_promo_value NUMERIC;
    v_promo_active BOOLEAN;
    v_pickup_geog geography;
    v_dropoff_geog geography;
    v_first_merchant UUID := NULL;
    v_item_merchant UUID;
BEGIN
    -- Validate items exist
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('error', 'No items provided');
    END IF;

    -- Process items and validate single merchant (for orders)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        -- Get product info
        SELECT name, price, merchant_id
        INTO v_product_name, v_product_price, v_item_merchant
        FROM public.products
        WHERE id = v_product_id AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('error', 'Product ' || v_product_id || ' not found or unavailable');
        END IF;

        -- Check all items from same merchant if order
        IF p_order_type = 'order' THEN
            IF v_first_merchant IS NULL THEN
                v_first_merchant := v_item_merchant;
            ELSIF v_item_merchant <> v_first_merchant THEN
                RETURN jsonb_build_object('error', 'All items must be from the same merchant');
            END IF;
        END IF;

        v_subtotal := v_subtotal + (v_product_price * v_quantity);
        
        v_processed_items := v_processed_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'price', v_product_price,
            'quantity', v_quantity,
            'subtotal', v_product_price * v_quantity,
            'merchant_id', v_item_merchant
        );
    END LOOP;

    -- Pickup location (for delivery fee calculation)
    IF p_order_type = 'order' THEN
        SELECT ST_SetSRID(ST_MakePoint(business_lng, business_lat), 4326)::geography
        INTO v_pickup_geog
        FROM public.merchants
        WHERE id = v_first_merchant;

        -- Buyer delivery location geography
        IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL THEN
            v_dropoff_geog := ST_SetSRID(ST_MakePoint(p_delivery_lng, p_delivery_lat), 4326)::geography;

            -- Calculate dynamic delivery fee
            v_delivery_fee := (
                SELECT (public.calculate_fare(
                    v_pickup_geog,
                    v_dropoff_geog,
                    1.60,  -- base fare
                    0.9,   -- per km rate
                    10.0   -- minimum fare
                ) ->> 'total_fare')::NUMERIC
            );
        ELSE
            v_delivery_fee := 0;
        END IF;
    ELSE
        -- For rides, delivery_fee = fare estimate
        v_delivery_fee := p_ride_fare;  -- This comes from ride quote input
    END IF;

    -- Service Fee (5% of subtotal or fare)
    IF p_order_type = 'order' THEN
        v_service_fee := ROUND(v_subtotal * 0.05, 2);
    ELSE
        v_service_fee := ROUND(v_delivery_fee * 0.05, 2);  -- ride service fee
    END IF;

    -- Promo Code logic
    IF p_promo_code IS NOT NULL AND p_promo_code != '' THEN
        SELECT discount_type, discount_value, active
        INTO v_promo_type, v_promo_value, v_promo_active
        FROM public.promotions
        WHERE code = p_promo_code AND (expires_at IS NULL OR expires_at > NOW());

        IF FOUND AND v_promo_active THEN
            IF v_promo_type = 'percent' THEN
                IF p_order_type = 'order' THEN
                    v_discount := ROUND(v_subtotal * (v_promo_value / 100), 2);
                ELSE
                    v_discount := ROUND(v_delivery_fee * (v_promo_value / 100), 2);
                END IF;
            ELSE
                v_discount := v_promo_value;
            END IF;
        END IF;
    END IF;

    -- Total calculation
    v_total := v_subtotal + v_delivery_fee + v_service_fee - v_discount;

    RETURN jsonb_build_object(
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'service_fee', v_service_fee,
        'discount', v_discount,
        'total_before_discount', v_subtotal + v_delivery_fee + v_service_fee,
        'total', v_total,
        'total_minor', floor(v_total * 100), -- Amount in Gp
        'items', v_processed_items,
        'merchant_id', v_first_merchant,
        'delivery_type', p_delivery_type,
        'order_type', p_order_type
    );
END;$$;


ALTER FUNCTION "public"."quote-1"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quote-old-latest"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$DECLARE
    v_subtotal NUMERIC := 0;
    v_delivery_fee NUMERIC := 0;
    v_service_fee NUMERIC := 0;
    v_discount NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_product_price NUMERIC;
    v_product_name TEXT;
    v_merchant_id UUID;
    v_processed_items JSONB := '[]'::JSONB;
    v_promo_type TEXT;
    v_promo_value NUMERIC;
    v_promo_active BOOLEAN;
    v_pickup_geog geography;
    v_dropoff_geog geography;
BEGIN
    -- Validate items exists
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('error', 'No items provided');
    END IF;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        -- Get product info
        SELECT name, price, merchant_id INTO v_product_name, v_product_price, v_merchant_id
        FROM public.products
        WHERE id = v_product_id AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('error', 'Product ' || v_product_id || ' not found or unavailable');
        END IF;

        v_subtotal := v_subtotal + (v_product_price * v_quantity);
        
        v_processed_items := v_processed_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'price', v_product_price,
            'quantity', v_quantity,
            'subtotal', v_product_price * v_quantity,
            'merchant_id', v_merchant_id
        );
    END LOOP;

    -- Fetch merchant pickup location
    SELECT ST_SetSRID(ST_MakePoint(business_lng, business_lat), 4326)::geography
    INTO v_pickup_geog
    FROM public.merchants
    WHERE id = (v_processed_items->0->>'merchant_id')::UUID;

    -- Buyer delivery location geography
    IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL THEN
        v_dropoff_geog := ST_SetSRID(ST_MakePoint(p_delivery_lng, p_delivery_lat), 4326)::geography;

        -- Calculate dynamic delivery fee
        v_delivery_fee := (
            SELECT (public.calculate_fare(
                v_pickup_geog,
                v_dropoff_geog,
                1.60,  -- base fare (can be dynamic)
                0.9,   -- per km rate (can be dynamic)
                10.0   -- minimum fare
            ) ->> 'total_fare')::NUMERIC
        );
    ELSE
        -- No delivery required
        v_delivery_fee := 0;
    END IF;

    -- Service Fee (5% of subtotal)
    v_service_fee := ROUND(v_subtotal * 0.05, 2);

    -- Promo Code logic
    IF p_promo_code IS NOT NULL AND p_promo_code != '' THEN
        SELECT discount_type, discount_value, active INTO v_promo_type, v_promo_value, v_promo_active
        FROM public.promotions
        WHERE code = p_promo_code AND (expires_at IS NULL OR expires_at > NOW());

        IF FOUND AND v_promo_active THEN
            IF v_promo_type = 'percent' THEN
                v_discount := ROUND(v_subtotal * (v_promo_value / 100), 2);
            ELSE
                v_discount := v_promo_value;
            END IF;
        END IF;
    END IF;

    -- Total calculation
    v_total := v_subtotal + v_delivery_fee + v_service_fee - v_discount;

    RETURN jsonb_build_object(
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'service_fee', v_service_fee,
        'discount', v_discount,
        'total', v_total,
        'total_minor', floor(v_total * 100), -- Amount in Gp
        'items', v_processed_items,
        'merchant_id', (v_processed_items->0->>'merchant_id')::UUID,
        'delivery_type', p_delivery_type
    );
END;$$;


ALTER FUNCTION "public"."quote-old-latest"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reduce_order_stock"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_item RECORD;
    v_current_stock INT;
    v_unfulfilled_items JSONB := '[]'::JSONB;
BEGIN
    -- Lock and reduce stock for all items
    FOR v_item IN 
        SELECT product_id, quantity, product_name, unit_price
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        -- Lock product row
        SELECT stock_quantity INTO v_current_stock
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF v_current_stock >= v_item.quantity THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - v_item.quantity
            WHERE id = v_item.product_id;
        ELSE
            -- Add to unfulfilled list
            v_unfulfilled_items := v_unfulfilled_items || jsonb_build_object(
                'product_id', v_item.product_id,
                'name', v_item.product_name,
                'requested_quantity', v_item.quantity,
                'available_stock', v_current_stock,
                'price_minor', floor(v_item.unit_price * 100)
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'unfulfilled_items', v_unfulfilled_items
    );
END;
$$;


ALTER FUNCTION "public"."reduce_order_stock"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reduce_stock_for_order"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE   
  v_result jsonb;   
  v_insufficient_stock text[];
  v_low_stock_products jsonb[];
  v_merchant_id uuid;
BEGIN   
  -- Get merchant_id for notifications
  SELECT DISTINCT p.merchant_id
  INTO v_merchant_id
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id
  LIMIT 1;

  -- Check if any products have insufficient stock   
  SELECT array_agg(p.name)   
  INTO v_insufficient_stock   
  FROM order_items oi   
  JOIN products p ON p.id = oi.product_id   
  WHERE oi.order_id = p_order_id     
    AND p.stock_quantity < oi.quantity;   

  -- If any products have insufficient stock, raise error   
  IF array_length(v_insufficient_stock, 1) > 0 THEN     
    RAISE EXCEPTION 'Insufficient stock for products: %',        
      array_to_string(v_insufficient_stock, ', ')       
      USING HINT = 'Stock ran out between order creation and payment';   
  END IF;   

  -- Reduce stock atomically   
  UPDATE products p   
  SET      
    stock_quantity = stock_quantity - oi.quantity,     
    total_sold = COALESCE(total_sold, 0) + oi.quantity,     
    updated_at = NOW()   
  FROM order_items oi   
  WHERE oi.order_id = p_order_id     
    AND oi.product_id = p.id;   

  -- Check for low stock AFTER reduction and collect product details
  SELECT array_agg(
    jsonb_build_object(
      'product_id', p.id,
      'product_name', p.name,
      'current_stock', p.stock_quantity,
      'threshold', p.low_stock_threshold
    )
  )
  INTO v_low_stock_products
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id
    AND p.stock_quantity <= p.low_stock_threshold;

  -- Insert notifications for low stock products
  IF array_length(v_low_stock_products, 1) > 0 THEN
    INSERT INTO merchant_notifications (
      merchant_id,
      notification_type,
      title,
      message,
      metadata,
      is_read,
      created_at
    )
    VALUES (
      v_merchant_id,
      'low_stock_alert',
      'Low Stock Alert',
      format('%s product(s) are running low on stock', array_length(v_low_stock_products, 1)),
      jsonb_build_object(
        'products', v_low_stock_products,
        'order_id', p_order_id,
        'timestamp', NOW()
      ),
      false,
      NOW()
    );
  END IF;

  -- Return summary with low stock info
  SELECT jsonb_build_object(     
    'order_id', p_order_id,     
    'items_updated', COUNT(*),     
    'total_quantity_reduced', SUM(oi.quantity),
    'low_stock_detected', COALESCE(array_length(v_low_stock_products, 1), 0),
    'low_stock_products', COALESCE(v_low_stock_products, '[]'::jsonb[])
  )   
  INTO v_result   
  FROM order_items oi   
  WHERE oi.order_id = p_order_id;   

  RETURN v_result; 
END;$$;


ALTER FUNCTION "public"."reduce_stock_for_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_payout"("p_reference" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update wallets
  set balance = balance + (
    select amount from payouts where reference = p_reference
  )
  where id = (select wallet_id from payouts where reference = p_reference);

  update payout_requests
  set status = 'failed',
      failure_reason = p_reason
  where reference = p_reference;
end;
$$;


ALTER FUNCTION "public"."refund_payout"("p_reference" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_funds_with_log"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$declare
    v_order transactions%rowtype;
    v_merchant_wallet wallets%rowtype;
    v_driver_wallet wallets%rowtype;
    v_platform_wallet wallets%rowtype;

    v_balance_before numeric(14,2);
begin
    -- 1️⃣ Fetch the escrow transaction for this order
    select *
    into v_order
    from transactions
    where order_id = p_order_id
      and escrow_status = 'held'
    for update;

    if not found then
        raise exception 'No held transaction found for order %', p_order_id;
    end if;

    -- 2️⃣ Merchant wallet
    select *
    into v_merchant_wallet
    from wallets
    where user_id = (select merchant_id from orders where id = p_order_id)
    for update;

    if not found then
        raise exception 'Merchant wallet not found for order %', p_order_id;
    end if;

    -- Credit merchant wallet
    v_balance_before := v_merchant_wallet.balance;
    update wallets
    set balance = balance + v_order.merchant_amount,
        updated_at = now()
    where id = v_merchant_wallet.id;

    insert into wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) values (
        v_merchant_wallet.id, 'credit', 'payout', v_order.merchant_amount,
        v_balance_before, v_balance_before + v_order.merchant_amount,
        'order', p_order_id,
        now()
    );

    -- 3️⃣ Driver wallet
    select *
    into v_driver_wallet
    from wallets
    where user_id = (select driver_id from orders where id = p_order_id)
    for update;

    if not found then
        raise exception 'Driver wallet not found for order %', p_order_id;
    end if;

    -- Credit driver wallet
    v_balance_before := v_driver_wallet.balance;
    update wallets
    set balance = balance + v_order.driver_amount,
        updated_at = now()
    where id = v_driver_wallet.id;

    insert into wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) values (
        v_driver_wallet.id, 'credit', 'payout', v_order.driver_amount,
        v_balance_before, v_balance_before + v_order.driver_amount,
        'order', p_order_id,
        now()
    );

    -- 4️⃣ Platform wallet (from system_config)
    select w.*
    into v_platform_wallet
    from wallets w
    join system_config sc
      on sc.value::uuid = w.user_id
    where sc.key = 'platform_user_id'
    for update;

    if not found then
        raise exception 'Platform wallet not found';
    end if;

    -- Credit platform wallet
    v_balance_before := v_platform_wallet.balance;
    update wallets
    set balance = balance + v_order.platform_amount,
        updated_at = now()
    where id = v_platform_wallet.id;

    insert into wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) values (
        v_platform_wallet.id, 'credit', 'fee', v_order.platform_amount,
        v_balance_before, v_balance_before + v_order.platform_amount,
        'order', p_order_id,
        now()
    );

    -- 5️⃣ Mark transaction as released
    update transactions
    set escrow_status = 'released',
        updated_at = now()
    where id = v_order.id;

    -- 6️⃣ Mark order as completed
    update orders
    set status = 'delivered',
        fulfilled_at = now(),
        updated_at = now()
    where id = p_order_id;

end;$$;


ALTER FUNCTION "public"."release_funds_with_log"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_funds_with_log-old"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
    v_order RECORD;
    v_merchant_wallet RECORD;
    v_driver_wallet RECORD;
    v_platform_wallet RECORD;

    v_merchant_amount NUMERIC;
    v_driver_amount NUMERIC;
    v_platform_amount NUMERIC;

    v_balance_before NUMERIC;
BEGIN
    -- 1️⃣ Fetch order & amounts
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    v_merchant_amount := v_order.merchant_amount;
    v_driver_amount := v_order.driver_amount;
    v_platform_amount := v_order.platform_amount;

    -- 2️⃣ Get merchant wallet
    SELECT *
    INTO v_merchant_wallet
    FROM wallets
    WHERE user_id = v_order.merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant wallet not found';
    END IF;

    -- Credit merchant wallet
    v_balance_before := v_merchant_wallet.balance;
    UPDATE wallets
    SET balance = balance + v_merchant_amount,
        updated_at = now()
    WHERE id = v_merchant_wallet.id;

    INSERT INTO wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) VALUES (
        v_merchant_wallet.id, 'credit', 'payout', v_merchant_amount,
        v_balance_before, v_balance_before + v_merchant_amount,
        'order', p_order_id,
        now()
    );

    -- 3️⃣ Get driver wallet
    SELECT *
    INTO v_driver_wallet
    FROM wallets
    WHERE user_id = v_order.driver_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver wallet not found';
    END IF;

    -- Credit driver wallet
    v_balance_before := v_driver_wallet.balance;
    UPDATE wallets
    SET balance = balance + v_driver_amount,
        updated_at = now()
    WHERE id = v_driver_wallet.id;

    INSERT INTO wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) VALUES (
        v_driver_wallet.id, 'credit', 'payout', v_driver_amount,
        v_balance_before, v_balance_before + v_driver_amount,
        'order', p_order_id,
        now()
    );

    -- 4️⃣ Get platform wallet
    SELECT w.*
    INTO v_platform_wallet
    FROM wallets w
    JOIN system_config sc
      ON sc.value::uuid = w.user_id
    WHERE sc.key = 'platform_wallet_id'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platform wallet not found';
    END IF;

    -- Credit platform wallet
    v_balance_before := v_platform_wallet.balance;
    UPDATE wallets
    SET balance = balance + v_platform_amount,
        updated_at = now()
    WHERE id = v_platform_wallet.id;

    INSERT INTO wallet_transactions(
        wallet_id, direction, type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        created_at
    ) VALUES (
        v_platform_wallet.id, 'credit', 'fee', v_platform_amount,
        v_balance_before, v_balance_before + v_platform_amount,
        'order', p_order_id,
        now()
    );

    -- 5️⃣ Mark order as completed
    UPDATE orders
    SET status = 'completed',
        fulfilled_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

END;$$;


ALTER FUNCTION "public"."release_funds_with_log-old"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_payout"("p_user_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_wallet wallets%rowtype;
  v_balance_before numeric(14,2);
  v_request_id uuid := gen_random_uuid();
  v_reference text := 'payout_' || v_request_id;
begin
  -- 1️⃣ Fetch wallet
  select *
  into v_wallet
  from wallets
  where user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active wallet not found';
  end if;

  -- 2️⃣ Check available balance
  if v_wallet.balance - v_wallet.locked_balance < p_amount then
    raise exception 'Insufficient available balance';
  end if;

  -- 3️⃣ Lock funds
  v_balance_before := v_wallet.balance;

  update wallets
  set locked_balance = locked_balance + p_amount,
      updated_at = now()
  where id = v_wallet.id;

  -- 4️⃣ Log lock
  insert into wallet_transactions (
    wallet_id,
    direction,
    type,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    created_at
  ) values (
    v_wallet.id,
    'debit',
    'payout',
    p_amount,
    v_balance_before,
    v_balance_before,
    'payout_request',
    v_request_id,
    now()
  );

  -- 5️⃣ Create payout request
  insert into payout_requests (
    id,
    wallet_id,
    user_id,
    amount,
    status,
    reference
  ) values (
    v_request_id,
    v_wallet.id,
    p_user_id,
    p_amount,
    'pending',
    v_reference
  );

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."request_payout"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_withdrawal"("p_user_id" "uuid", "p_payment_method_id" "uuid", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_balance NUMERIC;
    v_withdrawal_id UUID;
BEGIN
    -- Check balance
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('error', 'Wallet not found');
    END IF;

    IF v_balance < p_amount THEN
        RETURN jsonb_build_object('error', 'Insufficient balance');
    END IF;

    -- Create withdrawal record
    INSERT INTO public.withdrawals (user_id, payment_method_id, amount, status)
    VALUES (p_user_id, p_payment_method_id, p_amount, 'pending')
    RETURNING id INTO v_withdrawal_id;

    -- Deduct from wallet
    UPDATE public.wallets
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('id', v_withdrawal_id, 'status', 'pending');
END;
$$;


ALTER FUNCTION "public"."request_withdrawal"("p_user_id" "uuid", "p_payment_method_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reward_referral_wallet"("referral_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r public.referral_links%rowtype;
  w_id uuid;
  rew_id uuid;
begin
  -- Lock referral to prevent races
  select * into r
  from public.referral_links
  where id = referral_id
  for update;

  if not found then
    raise exception 'Referral not found: %', referral_id;
  end if;

  -- Only reward completed referrals
  if r.status <> 'completed' then
    return;
  end if;

  -- Ensure not expired at time of completion (optional strictness)
  if r.expires_at < now() then
    return;
  end if;

  -- Find referrer wallet
  select id into w_id from public.wallets where user_id = r.referrer_id;
  if w_id is null then
    raise exception 'Wallet missing for referrer %', r.referrer_id;
  end if;

  -- Upsert reward record idempotently
  insert into public.referral_rewards(referral_id, referrer_wallet_id, amount, status)
  values (r.id, w_id, amount, 'pending')
  on conflict (referral_id) do update set amount = excluded.amount
  returning id into rew_id;

  -- Insert wallet transaction idempotently using unique (wallet_id, reference_type, reference_id)
  begin
    insert into public.wallet_transactions(
      id, wallet_id, direction, type, amount,
      balance_before, balance_after,
      reference_type, reference_id, metadata
    )
    select
      gen_random_uuid(), w.id,
      'credit'::public.transaction_direction_enum,
      'payout',
      amount,
      w.balance,
      w.balance + amount,
      'referral_reward',
      rew_id,
      jsonb_build_object('referral_id', r.id, 'referred_id', r.referred_id, 'completed_order_id', r.completed_order_id)
    from public.wallets w
    where w.id = w_id;

    -- Update wallet balance and last_transaction_id
    update public.wallets
    set balance = balance + amount,
        last_transaction_id = (
          select t.id
          from public.wallet_transactions t
          where t.wallet_id = w_id
            and t.reference_type = 'referral_reward'
            and t.reference_id = rew_id
        )
    where id = w_id;

    -- Mark reward credited
    update public.referral_rewards
    set status = 'credited', credited_at = now()
    where id = rew_id;

  exception when unique_violation then
    -- Wallet txn already exists; finalize reward state
    update public.referral_rewards
    set status = 'credited', credited_at = coalesce(credited_at, now())
    where id = rew_id;
  end;
end;
$$;


ALTER FUNCTION "public"."reward_referral_wallet"("referral_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollback_wallet_balance"("uid" "uuid", "amt" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
    -- Ensure we do not rollback more than locked_balance
    update wallets
    set balance = balance + least(locked_balance, amt),
        locked_balance = locked_balance - least(locked_balance, amt),
        updated_at = now()
    where user_id = uid
      and locked_balance > 0;
end;
$$;


ALTER FUNCTION "public"."rollback_wallet_balance"("uid" "uuid", "amt" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") RETURNS TABLE("id" "uuid", "rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision, "status" "text", "assigned_driver_id" "uuid", "requested_at" timestamp with time zone, "started_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Lock the ride row
  perform 1
  from rides
  where rides.id = p_ride_id
  for update;

  if not found then
    raise exception 'Ride not found';
  end if;

  if (select rides.assigned_driver_id from rides where rides.id = p_ride_id) <> p_driver_id then
    raise exception 'Driver not assigned to this ride';
  end if;

  if (select rides.status from rides where rides.id = p_ride_id) <> 'assigned' then
    raise exception 'Ride cannot be started from current status';
  end if;

  -- Mark as in_progress
  return query
  update rides
  set status = 'in_progress',
      started_at = now()
  where rides.id = p_ride_id
  returning rides.id,
           rides.rider_id,
           ST_Y(rides.pickup::geometry) as pickup_lat,
           ST_X(rides.pickup::geometry) as pickup_lng,
           ST_Y(rides.dropoff::geometry) as dropoff_lat,
           ST_X(rides.dropoff::geometry) as dropoff_lng,
           rides.status,
           rides.assigned_driver_id,
           rides.requested_at,
           rides.started_at;
end;
$$;


ALTER FUNCTION "public"."start_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_active_role"("p_role_name" "text") RETURNS TABLE("switched_role_id" "uuid", "switched_role_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id uuid := auth.uid();
  v_role_id uuid;
  v_role_name text;
BEGIN
  -- 0. Require authentication
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Resolve role ID (normalized name)
  SELECT id, name
  INTO v_role_id, v_role_name
  FROM roles
  WHERE name = lower(trim(p_role_name))
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Invalid role: %', p_role_name;
  END IF;

  -- 2. Ensure user owns this role (eligibility)
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE profile_id = v_profile_id
      AND role_id = v_role_id
  ) THEN
    RAISE EXCEPTION 'User does not own this role';
  END IF;

  -- 3. Upsert active role atomically
  INSERT INTO active_user_role (profile_id, role_id, switched_at)
  VALUES (v_profile_id, v_role_id, now())
  ON CONFLICT (profile_id)
  DO UPDATE SET role_id = EXCLUDED.role_id, switched_at = now();

  -- 4. Audit: record the switch
  INSERT INTO user_role_events (profile_id, role_id, event_type)
  VALUES (v_profile_id, v_role_id, 'switch');

  -- 5. Return both role_id and role_name (aliased)
  RETURN QUERY SELECT v_role_id AS switched_role_id, v_role_name AS switched_role_name;
END;
$$;


ALTER FUNCTION "public"."switch_active_role"("p_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_active_role_old"("p_role_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_profile_id UUID := auth.uid();
  v_role_id UUID;
BEGIN
  -- 0. Ensure user is authenticated
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Resolve role ID
  SELECT id
  INTO v_role_id
  FROM roles
  WHERE name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Invalid role: %', p_role_name;
  END IF;

  -- 2. Ensure user owns this role
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE profile_id = v_profile_id
      AND role_id = v_role_id
  ) THEN
    RAISE EXCEPTION 'User does not own this role';
  END IF;

  -- 3. Upsert active role
  INSERT INTO active_user_role (
    profile_id,
    role_id,
    switched_at
  )
  VALUES (
    v_profile_id,
    v_role_id,
    now()
  )
  ON CONFLICT (profile_id)
  DO UPDATE SET
    role_id = EXCLUDED.role_id,
    switched_at = now();
END;$$;


ALTER FUNCTION "public"."switch_active_role_old"("p_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_seller_to_merchant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.merchants
    SET 
        business_name = COALESCE(NEW.business_name, business_name),
        business_address = COALESCE(NEW.business_address, business_address),
        business_email = COALESCE(NEW.business_email, business_email),
        tax_id = COALESCE(NEW.tax_id, tax_id)
    WHERE owner_id = NEW.user_id OR owner_id = NEW.profile_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_seller_to_merchant"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "trip_quote_id" "uuid",
    "ride_type" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "paystack_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_service_fee" numeric,
    "platform_service_fee" numeric,
    "commission" numeric,
    "driver_amount" numeric,
    "platform_amount" numeric
);

ALTER TABLE ONLY "public"."trip_payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."trip_payments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trip_payment_finalize"("p_trip_payment_id" "uuid", "p_driver_id" "uuid") RETURNS "public"."trip_payments"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_tp public.trip_payments;
  v_driver_wallet public.wallets;
  v_platform_wallet public.wallets;
  v_platform_user_id uuid;
begin
  -- 1. Lock trip_payment row
  select * into v_tp
  from public.trip_payments
  where id = p_trip_payment_id
  for update;

  if v_tp.id is null then
    raise exception 'Trip payment not found';
  end if;

  if v_tp.status = 'completed' then
    return v_tp; -- idempotency
  end if;

  -- 2. Lock driver wallet using p_driver_id
  select * into v_driver_wallet
  from public.wallets
  where user_id = p_driver_id
  for update;

  if v_driver_wallet.id is null then
    raise exception 'Driver wallet not found for user %', p_driver_id;
  end if;

  -- 3. Get platform_user_id from system_config
  select value::uuid into v_platform_user_id
  from public.system_config
  where key = 'platform_user_id'
  limit 1;

  if v_platform_user_id is null then
    raise exception 'Platform user_id not configured';
  end if;

  -- 4. Lock platform wallet
  select * into v_platform_wallet
  from public.wallets
  where user_id = v_platform_user_id
  for update;

  if v_platform_wallet.id is null then
    raise exception 'Platform wallet not found';
  end if;

  -- 5. Credit driver wallet
  update public.wallets
    set balance = balance + v_tp.driver_amount,
        updated_at = now()
  where id = v_driver_wallet.id;

  -- 6. Credit platform wallet
  update public.wallets
    set balance = balance + v_tp.platform_amount,
        updated_at = now()
  where id = v_platform_wallet.id;

  -- 7. Log driver transaction
  insert into public.wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    v_driver_wallet.id, 'credit', 'trip_payment', v_tp.driver_amount,
    v_driver_wallet.balance, v_driver_wallet.balance + v_tp.driver_amount,
    'trip_payment', v_tp.id, v_tp.paystack_reference,
    jsonb_build_object('role', 'driver')
  );

  -- 8. Log platform transaction
  insert into public.wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    v_platform_wallet.id, 'credit', 'trip_payment_fee', v_tp.platform_amount,
    v_platform_wallet.balance, v_platform_wallet.balance + v_tp.platform_amount,
    'trip_payment', v_tp.id, v_tp.paystack_reference,
    jsonb_build_object('role', 'platform')
  );

  -- 9. Update trip_payment record
  update public.trip_payments
    set status = 'completed',
        updated_at = now()
  where id = v_tp.id;

  -- ✅ Return the in‑memory record (no SELECT bug)
  return v_tp;
end;
$$;


ALTER FUNCTION "public"."trip_payment_finalize"("p_trip_payment_id" "uuid", "p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trip_payment_refund"("p_trip_payment_id" "uuid", "p_user_id" "uuid") RETURNS "public"."trip_payments"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_tp public.trip_payments;
  v_user_wallet public.wallets;
begin
  -- 1. Lock trip_payment row
  select * into v_tp
  from public.trip_payments
  where id = p_trip_payment_id
  for update;

  if v_tp.id is null then
    raise exception 'Trip payment not found';
  end if;

  if v_tp.status = 'cancelled' then
    return v_tp; -- idempotency
  end if;

  -- 2. Lock user wallet (the rider’s wallet)
  select * into v_user_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_user_wallet.id is null then
    raise exception 'User wallet not found for user %', p_user_id;
  end if;

  -- 3. Refund gross amount
  update public.wallets
    set balance = balance + v_tp.amount,
        updated_at = now()
  where id = v_user_wallet.id;

  -- 4. Log refund transaction
  insert into public.wallet_transactions (
    wallet_id, direction, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, external_reference, metadata
  )
  values (
    v_user_wallet.id, 'credit', 'trip_refund', v_tp.amount,
    v_user_wallet.balance, v_user_wallet.balance + v_tp.amount,
    'trip_payment', v_tp.id, v_tp.paystack_reference,
    jsonb_build_object('role', 'rider', 'reason', 'trip_cancelled')
  );

  -- 5. Update trip_payment record
  update public.trip_payments
    set status = 'cancelled',
        updated_at = now()
  where id = v_tp.id;

  -- ✅ Return the in‑memory record
  return v_tp;
end;
$$;


ALTER FUNCTION "public"."trip_payment_refund"("p_trip_payment_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlock_wallet_balance"("uid" "uuid", "amt" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
    v_wallet wallets%rowtype;
begin
    select * into v_wallet
    from wallets
    where user_id = uid
    for update;

    if not found then
        raise exception 'Wallet not found for user %', uid;
    end if;

    if v_wallet.locked_balance < amt then
        raise exception 'Cannot unlock more than locked balance';
    end if;

    update wallets
    set locked_balance = locked_balance - amt,
        updated_at = now()
    where id = v_wallet.id;
end;
$$;


ALTER FUNCTION "public"."unlock_wallet_balance"("uid" "uuid", "amt" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_driver_status"("p_driver_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) RETURNS TABLE("driver_id" "uuid", "is_online" boolean, "last_location" "public"."geography", "current_lat" double precision, "current_lng" double precision, "last_location_update" timestamp with time zone, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
    update drivers
    set 
        is_online = p_is_online,
        current_lat = p_lat,
        current_lng = p_lng,
        last_location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        last_location_update = now(),
        last_seen_at = now()
    where id = p_driver_id
    returning 
        id as driver_id, 
        is_online, 
        last_location,
        current_lat,
        current_lng,
        last_location_update,
        last_seen_at;
$$;


ALTER FUNCTION "public"."update_driver_status"("p_driver_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_push_token_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_push_token_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ride_status"("p_ride_id" "uuid", "p_status" "text", "p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_updated_count int;
BEGIN
    -- Update the ride status
    UPDATE public.ride_bookings
    SET 
        status = p_status::public.ride_status,
        updated_at = now()
    WHERE id = p_ride_id
      AND (buyer_id = p_user_id OR driver_id = p_user_id OR p_user_id IS NULL); 
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        RETURN json_build_object('success', true, 'message', 'Ride status updated to ' || p_status);
    ELSE
        -- Specific check for if user matches
        IF NOT EXISTS (SELECT 1 FROM public.ride_bookings WHERE id = p_ride_id) THEN
           RETURN json_build_object('success', false, 'error', 'Ride NOT FOUND: ' || p_ride_id::text);
        ELSE
           RETURN json_build_object('success', false, 'error', 'Permission denied for user: ' || coalesce(p_user_id::text, 'NULL'));
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."update_ride_status"("p_ride_id" "uuid", "p_status" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_location"("user_id" "uuid", "point_wkt" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$begin
update profiles set last_location = ST_GeomFromText(point_wkt) where id = user_id; 
end;$$;


ALTER FUNCTION "public"."update_user_location"("user_id" "uuid", "point_wkt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_active_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE profile_id = NEW.profile_id
      AND role_id = NEW.role_id
  ) THEN
    RAISE EXCEPTION 'Profile does not own this role';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_active_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_delivery_otp"("p_ride_request_id" "uuid", "p_delivery_otp" character varying) RETURNS TABLE("ride_request_id" "uuid", "ride_id" "uuid", "order_id" "uuid", "delivery_verified" boolean, "ride_status" "text", "order_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    v_ride_request record;
    v_ride record;
begin
    -- Fetch ride_request
    select * into v_ride_request
    from ride_requests
    where id = p_ride_request_id;

    if not found then
        raise exception 'Ride request not found';
    end if;

    if v_ride_request.delivery_verified then
        raise exception 'Delivery already verified';
    end if;

    if v_ride_request.delivery_otp != p_delivery_otp then
        raise exception 'Invalid delivery OTP';
    end if;

    -- Fetch ride
    select * into v_ride
    from rides
    where id = v_ride_request.ride_id;

    if not found then
        raise exception 'Ride not found';
    end if;

    -- 1️⃣ Update ride_request
    update ride_requests
    set delivery_verified = true,
        delivery_verified_at = now()
    where id = p_ride_request_id;

    -- 2️⃣ Update ride
    update rides
    set status = 'completed',
        completed_at = now()
    where id = v_ride.id;

    -- 3️⃣ Update order
    update orders
    set status = 'delivered'
    where id = v_ride.order_id;

    -- Return values
    return query
    select v_ride_request.id, v_ride_request.ride_id, v_ride.order_id, true, 'completed', 'delivered';
end;
$$;


ALTER FUNCTION "public"."verify_delivery_otp"("p_ride_request_id" "uuid", "p_delivery_otp" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_pickup_and_start_ride"("p_ride_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_ride_id UUID;
  v_order_id UUID;
  v_driver_id UUID;
BEGIN
  -- 1️⃣ Verify & update ride request
  UPDATE ride_requests
  SET
    pickup_verified = true,
    pickup_verified_at = now()
  WHERE id = p_ride_request_id
    AND pickup_verified = false
  RETURNING ride_id, driver_id
  INTO v_ride_id, v_driver_id;

  IF v_ride_id IS NULL THEN
    RAISE EXCEPTION 'Ride request not found or already verified';
  END IF;

  -- 2️⃣ Update ride
  UPDATE rides
  SET
    status = 'in_progress',
    started_at = now()
  WHERE id = v_ride_id
  RETURNING order_id
  INTO v_order_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Ride not found';
  END IF;

  -- 3️⃣ Update order: status + driver_id
  UPDATE orders
  SET
    status = 'picked_up',
    driver_id = v_driver_id
  WHERE id = v_order_id;

END;$$;


ALTER FUNCTION "public"."verify_pickup_and_start_ride"("p_ride_request_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."active_user_role" (
    "profile_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "switched_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."active_user_role" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid"
);


ALTER TABLE "public"."admin_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_name" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "method" "text" NOT NULL,
    "request_payload" "jsonb",
    "error_message" "text" NOT NULL,
    "retry_count" integer DEFAULT 0,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "uploaded_by" "public"."uploaded_by_enum" NOT NULL,
    "stage" "public"."attachment_stage_enum" NOT NULL,
    "file_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "order_id" "uuid",
    "action" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "device_model" "text",
    "os_version" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buyer_information" (
    "id" "uuid" NOT NULL,
    "default_payment_method" character varying(50),
    "average_rating" numeric(3,2) DEFAULT 0.00,
    "total_rides" integer DEFAULT 0,
    "total_orders" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."buyer_information" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_type_id" "uuid",
    "name" character varying(100) NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "parent_category_id" "uuid",
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "pickup_otp" character varying(6),
    "delivery_otp" character varying(6),
    "pickup_verified" boolean DEFAULT false,
    "delivery_verified" boolean DEFAULT false,
    "estimated_pickup_time" timestamp with time zone,
    "actual_pickup_time" timestamp with time zone,
    "estimated_delivery_time" timestamp with time zone,
    "actual_delivery_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pickup_lat" numeric,
    "pickup_lng" numeric,
    "delivery_lat" numeric,
    "delivery_lng" numeric,
    "status" "public"."ride_status"
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" NOT NULL,
    "address" character varying(255),
    "vehicle_brand" character varying(100),
    "vehicle_model" character varying(100),
    "vehicle_color" character varying(50),
    "vehicle_type" character varying(50),
    "cargo_capacity" numeric(10,2),
    "license_plate" character varying(20),
    "license_type" character varying(50),
    "driving_license_number" character varying(50),
    "driving_license_front_url" "text",
    "driving_license_back_url" "text",
    "driving_license_issuing_country" character varying(3),
    "kyc_verified" boolean DEFAULT false,
    "is_online" boolean DEFAULT false,
    "service_mode" character varying(20) DEFAULT 'both'::character varying,
    "current_lat" double precision,
    "current_lng" double precision,
    "last_location_update" timestamp with time zone,
    "acceptance_rate" numeric(5,2) DEFAULT 0.00,
    "average_rating" numeric(3,2) DEFAULT 0.00,
    "total_ratings" integer DEFAULT 0,
    "professionalism_score" numeric(5,2) DEFAULT 0.00,
    "total_completed_rides" integer DEFAULT 0,
    "total_completed_deliveries" integer DEFAULT 0,
    "total_earnings" numeric(12,2) DEFAULT 0.00,
    "account_status" character varying(20) DEFAULT 'active'::character varying,
    "suspension_reason" "text",
    "cancellation_count" integer DEFAULT 0,
    "flags_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_location" "public"."geography"(Point,4326),
    "last_seen_at" timestamp with time zone,
    "on_ride" boolean DEFAULT false NOT NULL,
    "vehicle_insurance_url" "text",
    "road_worthiness_url" "text",
    "service_tier" "text" DEFAULT 'standard'::"text",
    "ghana_card_front_url" "text",
    "ghana_card_back_url" "text",
    CONSTRAINT "drivers_account_status_check" CHECK ((("account_status")::"text" = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'deactivated'::character varying])::"text"[]))),
    CONSTRAINT "drivers_service_mode_check" CHECK ((("service_mode")::"text" = ANY ((ARRAY['ride'::character varying, 'delivery'::character varying, 'both'::character varying])::"text"[]))),
    CONSTRAINT "drivers_vehicle_type_check" CHECK ((("vehicle_type")::"text" = ANY (ARRAY[('car'::character varying)::"text", ('bike'::character varying)::"text", ('van'::character varying)::"text", ('truck'::character varying)::"text", ('suv'::character varying)::"text"])))
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drivers"."last_location" IS 'Driver''s location to be used for queries';



CREATE TABLE IF NOT EXISTS "public"."emergency_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "contact_name" character varying(255) NOT NULL,
    "contact_phone" character varying(20) NOT NULL,
    "relationship" character varying(50),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."emergency_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid",
    "contact_name" "text" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "emergency_notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."emergency_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."emergency_notifications" IS 'Stores SMS notifications sent to emergency contacts';



CREATE TABLE IF NOT EXISTS "public"."id_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "front_url" "text",
    "back_url" "text",
    "card_type" character varying(100),
    "card_number" character varying(255),
    "card_issuing_country" character varying(3),
    "card_issuing_date" timestamp with time zone,
    "card_expiration_date" timestamp with time zone,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "id_cards_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'rejected'::character varying])::"text"[])))
);


ALTER TABLE "public"."id_cards" OWNER TO "postgres";


COMMENT ON TABLE "public"."id_cards" IS 'This table stores users id cards data';



CREATE TABLE IF NOT EXISTS "public"."lease_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "user_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "lease_duration_days" integer,
    "total_amount" numeric(10,2) NOT NULL,
    "deposit_paid" numeric(10,2) DEFAULT 0,
    "pickup_location" "text",
    "dropoff_location" "text",
    "driver_license_number" "text",
    "driver_license_expiry" "date",
    "additional_notes" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lease_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lease_vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year" integer,
    "transmission" "text",
    "fuel_type" "text",
    "vehicle_type" "text" NOT NULL,
    "daily_rate" numeric(10,2) NOT NULL,
    "weekly_rate" numeric(10,2),
    "monthly_rate" numeric(10,2),
    "image_url" "text",
    "description" "text",
    "available" boolean DEFAULT true,
    "location" "text",
    "seats" integer,
    "rating" numeric(3,2) DEFAULT 5.0,
    "owner_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lease_vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchant_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."merchant_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "id" "uuid" NOT NULL,
    "business_name" character varying(255) NOT NULL,
    "business_type" character varying(50),
    "business_license_number" character varying(100),
    "tax_id" character varying(50),
    "business_address" "text" NOT NULL,
    "business_lat" numeric(10,8),
    "business_lng" numeric(11,8),
    "business_phone" character varying(20),
    "business_email" character varying(255),
    "logo_url" "text",
    "banner_url" "text",
    "description" "text",
    "opening_hours" "jsonb",
    "is_open" boolean DEFAULT false,
    "open_status" character varying(20) DEFAULT 'default'::character varying,
    "kyc_verified" boolean DEFAULT false,
    "average_rating" numeric(3,2) DEFAULT 0.00,
    "total_ratings" integer DEFAULT 0,
    "total_orders" integer DEFAULT 0,
    "commission_rate" numeric(5,2) DEFAULT 15.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "business_location" "public"."geography",
    "owner_id" "uuid",
    "ghana_card_front_url" "text",
    "ghana_card_back_url" "text",
    "business_cert_url" "text",
    CONSTRAINT "merchants_open_status_check" CHECK ((("open_status")::"text" = ANY ((ARRAY['default'::character varying, 'close'::character varying, 'open'::character varying])::"text"[])))
);


ALTER TABLE "public"."merchants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_queue" (
    "id" bigint NOT NULL,
    "channel" "text" NOT NULL,
    "recipient_id" "uuid",
    "title" "text",
    "body" "text",
    "data" "jsonb",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications_queue" OWNER TO "postgres";


ALTER TABLE "public"."notifications_queue" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notifications_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."order_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_number" "text" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "issue_type" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolution_notes" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."order_issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "merchant_id" "uuid",
    "product_id" "uuid",
    "product_name" "text",
    "product_description" "text",
    "product_image_url" "text",
    "unit_price" numeric(12,2) NOT NULL,
    "quantity" integer NOT NULL,
    "total_price" numeric(12,2) NOT NULL,
    "variant_name" "text",
    "variant_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customizations" "jsonb",
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "public"."order_status_enum" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "old_status" "public"."order_status_enum",
    "new_status" "public"."order_status_enum" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_status_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(50) NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "merchant_id" "uuid",
    "subtotal" numeric(12,2) NOT NULL,
    "delivery_fee" numeric(12,2) DEFAULT 0.00,
    "service_fee" numeric(12,2) DEFAULT 0.00,
    "tax_amount" numeric(12,2) DEFAULT 0.00,
    "discount_amount" numeric(12,2) DEFAULT 0.00,
    "tip_amount" numeric(12,2) DEFAULT 0.00,
    "total_major" numeric(12,2) NOT NULL,
    "escrow_amount" numeric(12,2) DEFAULT 0.00,
    "refund_fee" numeric(12,2) DEFAULT 0.00,
    "delivery_address" "text",
    "delivery_lat" numeric(10,8),
    "delivery_lng" numeric(11,8),
    "delivery_type" "public"."delivery_type_enum" DEFAULT 'standard'::"public"."delivery_type_enum",
    "status" "public"."order_status_enum" DEFAULT 'pending_payment'::"public"."order_status_enum",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancelled_by" "public"."cancelled_by_enum",
    "payment_method" "public"."payment_platform_enum",
    "payment_status" "public"."payment_status_enum" DEFAULT 'pending'::"public"."payment_status_enum",
    "payment_reference" "text",
    "refunded_at" timestamp with time zone,
    "promo_code" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "paid_at" timestamp with time zone,
    "total_minor" numeric NOT NULL,
    "pricing_snapshot" "jsonb" NOT NULL,
    "metadata" "jsonb",
    "failed_reason" "text",
    "refunded_amount" numeric(12,2) DEFAULT 0.00,
    "fulfilled_at" timestamp with time zone,
    "driver_id" "uuid",
    "driver_accepted_at" timestamp with time zone,
    "pickup_code" "text",
    "delivery_code" "text",
    "driver_arrived_at_pickup_at" timestamp with time zone,
    "pickup_lat" numeric(10,8),
    "pickup_lng" numeric(11,8),
    "assigned_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "estimated_ready_time" timestamp with time zone,
    "is_scheduled" boolean DEFAULT false,
    "order_type" "text" DEFAULT 'delivery'::"text",
    "driver_lat" numeric(10,8),
    "driver_lng" numeric(11,8)
);

ALTER TABLE ONLY "public"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."total_minor" IS 'Total paysatck equivalent amount';



COMMENT ON COLUMN "public"."orders"."driver_id" IS 'Reference to the driver profile assigned to this order.';



COMMENT ON COLUMN "public"."orders"."pickup_lat" IS 'Latitude of the pickup location (usually merchant location at time of assignment)';



COMMENT ON COLUMN "public"."orders"."pickup_lng" IS 'Longitude of the pickup location (usually merchant location at time of assignment)';



COMMENT ON COLUMN "public"."orders"."assigned_at" IS 'The timestamp when a driver was assigned to the order.';



COMMENT ON COLUMN "public"."orders"."accepted_at" IS 'Timestamp when the driver accepted the order.';



COMMENT ON COLUMN "public"."orders"."picked_up_at" IS 'Timestamp when the driver picked up the order from the merchant.';



COMMENT ON COLUMN "public"."orders"."completed_at" IS 'Timestamp when the order was successfully delivered.';



CREATE TABLE IF NOT EXISTS "public"."outbox_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "error_message" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "aggregate_type" "text",
    "aggregate_id" "text"
);


ALTER TABLE "public"."outbox_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "label" "text" NOT NULL,
    "details" "jsonb" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" "text" NOT NULL,
    "failure_reason" "text",
    "reference" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "paystack_reference" "text",
    "recipient_id" "uuid",
    "recipient_type" "text",
    CONSTRAINT "payout_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payout_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paystack_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "recipient_code" "text" NOT NULL,
    "bank_name" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "recipient_type" "text" DEFAULT 'bank'::"text",
    "phone_number" "text",
    "provider" "text",
    "currency" "text" DEFAULT 'GHS'::"text" NOT NULL,
    CONSTRAINT "paystack_recipients_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."paystack_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paystack_webhook_logs" (
    "id" bigint NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "signature_valid" boolean NOT NULL,
    "event_type" "text",
    "meta_type" "text",
    "data_id" "text",
    "transfer_code" "text",
    "status" "text",
    "reason" "text",
    "payload" "jsonb" NOT NULL
);


ALTER TABLE "public"."paystack_webhook_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."paystack_webhook_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."paystack_webhook_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."paystack_webhook_logs_id_seq" OWNED BY "public"."paystack_webhook_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."phone_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" character varying NOT NULL,
    "code" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp without time zone NOT NULL
);


ALTER TABLE "public"."phone_otps" OWNER TO "postgres";


COMMENT ON TABLE "public"."phone_otps" IS 'This table stores the OTPs';



CREATE TABLE IF NOT EXISTS "public"."product_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "share_type" "text",
    "referrer" "text",
    "converted" boolean DEFAULT false,
    "clicked_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" character varying(255) NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "compare_at_price" numeric(10,2),
    "stock_quantity" integer DEFAULT 0,
    "low_stock_threshold" integer DEFAULT 5,
    "image_urls" "text"[],
    "is_available" boolean DEFAULT true,
    "is_featured" boolean DEFAULT false,
    "average_rating" numeric(3,2) DEFAULT 0.00,
    "total_ratings" integer DEFAULT 0,
    "total_sold" integer DEFAULT 0,
    "weight" numeric(10,2),
    "dimensions" "jsonb",
    "tags" character varying(255)[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "featured_image" "text",
    "customization_options" "jsonb",
    "location" "text",
    "rental_duration" "text",
    "deposit" numeric,
    "item_type" "text",
    "product_type" "text",
    "expiration_date" "date",
    "dosage_info" "text",
    "prescription_required" boolean DEFAULT false,
    "regulatory_notes" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "id_card_id" "uuid",
    "phone_number" character varying(20) NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "country" character varying(100),
    "region" character varying(100),
    "city" character varying(100),
    "email" character varying(255),
    "avatar_url" "text",
    "is_active" boolean DEFAULT true,
    "otp_verified" boolean DEFAULT false,
    "phone_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_type" character varying DEFAULT 'buyer'::character varying NOT NULL,
    "last_location" "public"."geography",
    "referral_code" "text",
    "referral_credits" numeric DEFAULT 0,
    "referred_by" "text",
    "total_referrals" integer DEFAULT 0,
    CONSTRAINT "profiles_user_type_check" CHECK ((("user_type")::"text" = ANY ((ARRAY['buyer'::character varying, 'driver'::character varying, 'merchant'::character varying])::"text"[])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'This table stores users data';



COMMENT ON COLUMN "public"."profiles"."referral_code" IS 'Unique referral code for this user';



COMMENT ON COLUMN "public"."profiles"."referral_credits" IS 'Total credits earned from referrals';



COMMENT ON COLUMN "public"."profiles"."referred_by" IS 'Referral code of the user who referred this user';



COMMENT ON COLUMN "public"."profiles"."total_referrals" IS 'Total number of successful referrals';



CREATE TABLE IF NOT EXISTS "public"."promotion_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promo_code" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promotion_usages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "code" character varying NOT NULL,
    "discount_type" character varying(10),
    "discount_value" numeric(12,2),
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "promo_owner" "text",
    "usage_limit" integer,
    "min_order_amount" numeric(12,2),
    "max_discount_amount" numeric(12,2),
    "applies_to" "text"[] DEFAULT '{ride,delivery,ecommerce}'::"text"[] NOT NULL,
    CONSTRAINT "promotions_discount_type_check" CHECK ((("discount_type")::"text" = ANY ((ARRAY['percent'::character varying, 'fixed'::character varying])::"text"[]))),
    CONSTRAINT "promotions_promo_owner_check" CHECK (("promo_owner" = ANY (ARRAY['platform'::"text", 'merchant'::"text"])))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" character varying(10) NOT NULL,
    "device_id" "text",
    "device_name" "text",
    "app_version" "text",
    "is_active" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_notification_tokens_platform_check" CHECK ((("platform")::"text" = ANY ((ARRAY['fcm'::character varying, 'apns'::character varying])::"text"[])))
);


ALTER TABLE "public"."push_notification_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_name" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recent_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "latitude" numeric(10,8) NOT NULL,
    "longitude" numeric(11,8) NOT NULL,
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recent_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_links" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "referral_code" "text" NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_order_id" "uuid",
    "required_successful_events" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb",
    CONSTRAINT "referral_links_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."referral_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "reminder_scheduled_for" timestamp with time zone,
    "status" "text" NOT NULL,
    "reminder_sent_at" timestamp with time zone,
    "review_submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "review_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reminded'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."review_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "pickup_address" "text" NOT NULL,
    "pickup_lat" numeric(10,8) NOT NULL,
    "pickup_lng" numeric(11,8) NOT NULL,
    "dropoff_address" "text" NOT NULL,
    "dropoff_lat" numeric(10,8) NOT NULL,
    "dropoff_lng" numeric(11,8) NOT NULL,
    "pickup_point" "public"."geography"(Point,4326) GENERATED ALWAYS AS ("public"."st_setsrid"("public"."st_makepoint"(("pickup_lng")::double precision, ("pickup_lat")::double precision), 4326)) STORED,
    "dropoff_point" "public"."geography"(Point,4326) GENERATED ALWAYS AS ("public"."st_setsrid"("public"."st_makepoint"(("dropoff_lng")::double precision, ("dropoff_lat")::double precision), 4326)) STORED,
    "ride_type" "public"."ride_type_enum" DEFAULT 'standard'::"public"."ride_type_enum",
    "estimated_distance" numeric(10,2),
    "estimated_duration" integer,
    "estimated_fare" numeric(10,2),
    "actual_distance" numeric(10,2),
    "actual_duration" integer,
    "final_fare" numeric(10,2),
    "status" "public"."ride_status" DEFAULT 'pending'::"public"."ride_status",
    "scheduled_for" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "pickup_arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancelled_by" "uuid",
    "cancelled_by_role_id" "uuid",
    "payment_method" character varying(50),
    "payment_status" "public"."payment_status_enum" DEFAULT 'pending'::"public"."payment_status_enum",
    "tip_amount" numeric(10,2) DEFAULT 0.00,
    "emergency_shared" boolean DEFAULT false,
    "emergency_contacts_notified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "driver_current_lat" numeric(10,8),
    "driver_current_lng" numeric(11,8),
    "arrived_at_pickup_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."ride_bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."ride_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_driver_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid",
    "driver_id" "uuid",
    "response" "text" NOT NULL,
    "responded_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ride_driver_responses_response_check" CHECK (("response" = ANY (ARRAY['accepted'::"text", 'rejected'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."ride_driver_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_request_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid",
    "ride_request_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "ride_request_notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."ride_request_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."ride_request_notifications" IS 'Tracks ride request broadcasts to drivers';



CREATE TABLE IF NOT EXISTS "public"."ride_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "pickup_otp" character varying(6),
    "delivery_otp" character varying(6),
    "pickup_verified" boolean DEFAULT false,
    "delivery_verified" boolean DEFAULT false,
    "driver_arrived_at" timestamp with time zone,
    "pickup_verified_at" timestamp with time zone,
    "delivery_verified_at" timestamp with time zone,
    "vehicle_type" "public"."vehicle_type_enum" DEFAULT 'bike'::"public"."vehicle_type_enum" NOT NULL
);


ALTER TABLE "public"."ride_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_search_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid",
    "attempt_number" integer NOT NULL,
    "radius_m" integer NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "outcome" "text",
    CONSTRAINT "ride_search_attempts_outcome_check" CHECK (("outcome" = ANY (ARRAY['found'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."ride_search_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rider_id" "uuid",
    "pickup" "public"."geography"(Point,4326) NOT NULL,
    "dropoff" "public"."geography"(Point,4326) NOT NULL,
    "status" "text" NOT NULL,
    "assigned_driver_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "order_id" "uuid" NOT NULL,
    "vehicle_type" "public"."vehicle_type_enum" DEFAULT 'bike'::"public"."vehicle_type_enum" NOT NULL,
    CONSTRAINT "rides_status_check" CHECK (("status" = ANY (ARRAY['searching'::"text", 'assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."rides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(20) NOT NULL,
    "description" "text",
    CONSTRAINT "roles_name_check" CHECK ((("name")::"text" = ANY (ARRAY['buyer'::"text", 'driver'::"text", 'merchant'::"text", 'admin'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" character varying(50),
    "address_line" "text" NOT NULL,
    "city" character varying(100),
    "state" character varying(100),
    "postal_code" character varying(20),
    "country" character varying(3),
    "lat" numeric(10,8) NOT NULL,
    "lng" numeric(11,8) NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_payout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."seller_payout_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "business_name" "text",
    "business_email" "text",
    "phone_number" "text",
    "is_verified" boolean DEFAULT false,
    "payout_settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "profile_id" "uuid",
    "business_type" "text",
    "business_address" "text",
    "business_hours" "jsonb",
    "bank_name" "text",
    "bank_account_number" "text",
    "tax_id" "text",
    "ghana_card_number" "text",
    "ghana_card_front_url" "text",
    "ghana_card_back_url" "text",
    "business_cert_url" "text",
    "rating" numeric(3,2) DEFAULT 5.0,
    "total_reviews" integer DEFAULT 0,
    "total_sales" integer DEFAULT 0,
    "bank_branch" "text",
    "account_name" "text"
);


ALTER TABLE "public"."seller_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid",
    "share_type" "text",
    "referrer" "text",
    "converted" boolean DEFAULT false,
    "clicked_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."store_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."support_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "type" "public"."transaction_type_enum" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "fee" numeric(12,2) DEFAULT 0.00,
    "platform_fee" numeric(12,2) DEFAULT 0.00,
    "status" "public"."payment_status_enum" DEFAULT 'pending'::"public"."payment_status_enum",
    "provider_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "provider" "text" DEFAULT 'paystack'::"text",
    "provider_response" "jsonb",
    "metadata" "jsonb",
    "access_code" "text",
    "authorization_url" "text",
    "failed_reason" "text",
    "refunded_amount" numeric(12,2) DEFAULT 0.00,
    "payment_source" "text" NOT NULL,
    "escrow_status" "text" DEFAULT 'held'::"text" NOT NULL,
    "merchant_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "driver_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "escrow_release_requires_breakdown" CHECK ((("escrow_status" <> 'released'::"text") OR ("amount" = (("merchant_amount" + "driver_amount") + "platform_amount")))),
    CONSTRAINT "transaction_amount_integrity" CHECK (("amount" = (("merchant_amount" + "driver_amount") + "platform_amount"))),
    CONSTRAINT "transaction_amounts_non_negative" CHECK ((("merchant_amount" >= (0)::numeric) AND ("driver_amount" >= (0)::numeric) AND ("platform_amount" >= (0)::numeric))),
    CONSTRAINT "transactions_escrow_status_check" CHECK (("escrow_status" = ANY (ARRAY['held'::"text", 'released'::"text", 'refunded'::"text"]))),
    CONSTRAINT "transactions_payment_source_check" CHECK (("payment_source" = ANY (ARRAY['paystack'::"text", 'wallet'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transactions"."access_code" IS 'Access code from paystack';



COMMENT ON COLUMN "public"."transactions"."authorization_url" IS 'Paystack authorization url';



CREATE TABLE IF NOT EXISTS "public"."trip_driver_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "distance_m" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notified_at" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_driver_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_pricing_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "estimated_fare" numeric NOT NULL,
    "currency" "text" DEFAULT 'GHS'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trip_pricing_quotes_tier_check" CHECK (("tier" = ANY (ARRAY['express'::"text", 'standard'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."trip_pricing_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pickup" "jsonb" NOT NULL,
    "dropoff" "jsonb" NOT NULL,
    "quotes" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "quote_valid_until" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "pickup" "public"."geography" NOT NULL,
    "dropoff" "public"."geography" NOT NULL,
    "distance_km" numeric,
    "estimated_duration_min" numeric,
    "selected_tier" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "pickup_lat" numeric NOT NULL,
    "pickup_lng" numeric NOT NULL,
    "dropoff_lat" numeric NOT NULL,
    "dropoff_lng" numeric NOT NULL,
    "dispatch_status" "text" DEFAULT 'searching'::"text",
    "current_offer_driver_id" "uuid",
    "trip_payment_id" "uuid",
    CONSTRAINT "dropoff_lat_valid" CHECK ((("dropoff_lat" >= ('-90'::integer)::numeric) AND ("dropoff_lat" <= (90)::numeric))),
    CONSTRAINT "dropoff_lng_valid" CHECK ((("dropoff_lng" >= ('-180'::integer)::numeric) AND ("dropoff_lng" <= (180)::numeric))),
    CONSTRAINT "pickup_lat_valid" CHECK ((("pickup_lat" >= ('-90'::integer)::numeric) AND ("pickup_lat" <= (90)::numeric))),
    CONSTRAINT "pickup_lng_valid" CHECK ((("pickup_lng" >= ('-180'::integer)::numeric) AND ("pickup_lng" <= (180)::numeric))),
    CONSTRAINT "trips_selected_tier_check" CHECK (("selected_tier" = ANY (ARRAY['express'::"text", 'standard'::"text", 'premium'::"text"]))),
    CONSTRAINT "trips_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'priced'::"text", 'payment_pending'::"text", 'paid'::"text", 'driver_searching'::"text", 'driver_assigned'::"text", 'driver_arrived'::"text", 'ride_started'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_discounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(14,2) NOT NULL,
    "uses_remaining" integer DEFAULT 1 NOT NULL,
    "min_order_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "is_first_order" boolean DEFAULT false NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "user_discounts_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"])))
);


ALTER TABLE "public"."user_discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_role_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['switch'::"text", 'grant'::"text", 'revoke'::"text"])))
);


ALTER TABLE "public"."user_role_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "profile_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "completed_requirements" boolean DEFAULT false,
    "assigned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_success_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_success_events_domain_check" CHECK (("domain" = ANY (ARRAY['ride'::"text", 'delivery'::"text", 'ecommerce'::"text"])))
);


ALTER TABLE "public"."user_success_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "direction" "public"."transaction_direction_enum" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "external_reference" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['escrow_hold'::"text", 'escrow_release'::"text", 'payment'::"text", 'payout'::"text", 'refund'::"text", 'fee'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance" numeric(14,2) DEFAULT 0.00 NOT NULL,
    "locked_balance" numeric(14,2) DEFAULT 0.00 NOT NULL,
    "currency" "text" DEFAULT 'GHS'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_transaction_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wallet_balance_non_negative" CHECK ((("balance" >= (0)::numeric) AND ("locked_balance" >= (0)::numeric))),
    CONSTRAINT "wallets_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payment_method_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."withdrawals" OWNER TO "postgres";


ALTER TABLE ONLY "public"."paystack_webhook_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."paystack_webhook_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."active_user_role"
    ADD CONSTRAINT "active_user_role_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."active_user_role"
    ADD CONSTRAINT "active_user_role_user_unique" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_errors"
    ADD CONSTRAINT "api_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_types"
    ADD CONSTRAINT "business_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."business_types"
    ADD CONSTRAINT "business_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buyer_information"
    ADD CONSTRAINT "buyer_information_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_driving_license_number_key" UNIQUE ("driving_license_number");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_buyer_id_contact_phone_key" UNIQUE ("buyer_id", "contact_phone");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_notifications"
    ADD CONSTRAINT "emergency_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."id_cards"
    ADD CONSTRAINT "id_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lease_requests"
    ADD CONSTRAINT "lease_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lease_vehicles"
    ADD CONSTRAINT "lease_vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchant_notifications"
    ADD CONSTRAINT "merchant_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_queue"
    ADD CONSTRAINT "notifications_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_issues"
    ADD CONSTRAINT "order_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_log"
    ADD CONSTRAINT "order_status_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status"
    ADD CONSTRAINT "order_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outbox_events"
    ADD CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."paystack_recipients"
    ADD CONSTRAINT "paystack_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paystack_recipients"
    ADD CONSTRAINT "paystack_recipients_recipient_code_key" UNIQUE ("recipient_code");



ALTER TABLE ONLY "public"."paystack_transfers"
    ADD CONSTRAINT "paystack_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paystack_transfers"
    ADD CONSTRAINT "paystack_transfers_unique_idem" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."paystack_webhook_logs"
    ADD CONSTRAINT "paystack_webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phone_otps"
    ADD CONSTRAINT "phone_otps_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."phone_otps"
    ADD CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_shares"
    ADD CONSTRAINT "product_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_number_key" UNIQUE ("phone_number");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_usages"
    ADD CONSTRAINT "promotion_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."push_notification_tokens"
    ADD CONSTRAINT "push_notification_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_notification_tokens"
    ADD CONSTRAINT "push_notification_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."recent_locations"
    ADD CONSTRAINT "recent_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."referral_links"
    ADD CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_links"
    ADD CONSTRAINT "referral_links_referred_unique" UNIQUE ("referred_id");



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_driver_responses"
    ADD CONSTRAINT "ride_driver_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_request_notifications"
    ADD CONSTRAINT "ride_request_notifications_driver_id_ride_request_id_key" UNIQUE ("driver_id", "ride_request_id");



ALTER TABLE ONLY "public"."ride_request_notifications"
    ADD CONSTRAINT "ride_request_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_requests"
    ADD CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_search_attempts"
    ADD CONSTRAINT "ride_search_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_addresses"
    ADD CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_payout_requests"
    ADD CONSTRAINT "seller_payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."store_shares"
    ADD CONSTRAINT "store_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_chats"
    ADD CONSTRAINT "support_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_driver_queue"
    ADD CONSTRAINT "trip_driver_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_driver_queue"
    ADD CONSTRAINT "trip_driver_queue_trip_id_driver_id_key" UNIQUE ("trip_id", "driver_id");



ALTER TABLE ONLY "public"."trip_payments"
    ADD CONSTRAINT "trip_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_pricing_quotes"
    ADD CONSTRAINT "trip_pricing_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_quotes"
    ADD CONSTRAINT "trip_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_notification_tokens"
    ADD CONSTRAINT "unique_device_per_user" UNIQUE ("device_id", "profile_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "unique_order_payment" UNIQUE ("order_id", "type");



ALTER TABLE ONLY "public"."promotion_usages"
    ADD CONSTRAINT "unique_promo_per_user" UNIQUE ("promo_code", "user_id");



ALTER TABLE ONLY "public"."ride_requests"
    ADD CONSTRAINT "unique_ride_driver" UNIQUE ("ride_id", "driver_id");



ALTER TABLE ONLY "public"."user_discounts"
    ADD CONSTRAINT "user_discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_discounts"
    ADD CONSTRAINT "user_discounts_user_id_discount_type_source_key" UNIQUE ("user_id", "discount_type", "source");



ALTER TABLE ONLY "public"."user_role_events"
    ADD CONSTRAINT "user_role_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("profile_id", "role_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_unique" UNIQUE ("profile_id", "role_id");



ALTER TABLE ONLY "public"."user_success_events"
    ADD CONSTRAINT "user_success_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_success_events"
    ADD CONSTRAINT "user_success_events_user_id_domain_source_id_key" UNIQUE ("user_id", "domain", "source_id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id");



CREATE INDEX "drivers_is_online_idx" ON "public"."drivers" USING "btree" ("is_online");



CREATE INDEX "drivers_last_location_gist" ON "public"."drivers" USING "gist" ("last_location");



CREATE INDEX "drivers_last_location_update_idx" ON "public"."drivers" USING "btree" ("last_location_update");



CREATE INDEX "drivers_online_active_idx" ON "public"."drivers" USING "btree" ("service_mode", "vehicle_type") WHERE (("is_online" = true) AND (("account_status")::"text" = 'active'::"text"));



CREATE INDEX "drivers_online_mode_type_idx" ON "public"."drivers" USING "btree" ("service_mode", "vehicle_type") WHERE ("is_online" = true);



CREATE INDEX "drivers_service_mode_idx" ON "public"."drivers" USING "btree" ("service_mode");



CREATE INDEX "drivers_vehicle_type_idx" ON "public"."drivers" USING "btree" ("vehicle_type");



CREATE INDEX "idx_bookings_buyer" ON "public"."ride_bookings" USING "btree" ("buyer_id");



CREATE INDEX "idx_bookings_created" ON "public"."ride_bookings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_bookings_driver" ON "public"."ride_bookings" USING "btree" ("driver_id");



CREATE INDEX "idx_bookings_dropoff_point" ON "public"."ride_bookings" USING "gist" ("dropoff_point");



CREATE INDEX "idx_bookings_pickup_point" ON "public"."ride_bookings" USING "gist" ("pickup_point");



CREATE INDEX "idx_bookings_status" ON "public"."ride_bookings" USING "btree" ("status");



CREATE INDEX "idx_business_type_categories" ON "public"."categories" USING "btree" ("business_type_id");



CREATE INDEX "idx_business_types_name" ON "public"."business_types" USING "btree" ("name");



CREATE INDEX "idx_buyer_information_id" ON "public"."buyer_information" USING "btree" ("id");



CREATE INDEX "idx_categories_slug" ON "public"."categories" USING "btree" ("slug");



CREATE INDEX "idx_drivers_id" ON "public"."drivers" USING "btree" ("id");



CREATE INDEX "idx_drivers_last_location" ON "public"."drivers" USING "gist" ("last_location");



CREATE INDEX "idx_drivers_location" ON "public"."drivers" USING "gist" ("last_location");



CREATE INDEX "idx_drivers_service_tier" ON "public"."drivers" USING "btree" ("service_tier");



CREATE INDEX "idx_emergency_contacts_buyer" ON "public"."emergency_contacts" USING "btree" ("buyer_id");



CREATE INDEX "idx_emergency_notifications_ride" ON "public"."emergency_notifications" USING "btree" ("ride_id");



CREATE INDEX "idx_full_name" ON "public"."profiles" USING "btree" ("full_name");



CREATE INDEX "idx_is_online" ON "public"."drivers" USING "btree" ("is_online");



CREATE INDEX "idx_merchant_notifications_merchant_unread" ON "public"."merchant_notifications" USING "btree" ("merchant_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_merchants_is_open" ON "public"."merchants" USING "btree" ("is_open");



CREATE INDEX "idx_merchants_name" ON "public"."merchants" USING "btree" ("business_name");



CREATE UNIQUE INDEX "idx_one_pending_payment_per_order" ON "public"."transactions" USING "btree" ("order_id") WHERE (("status" = 'pending'::"public"."payment_status_enum") AND ("type" = 'payment'::"public"."transaction_type_enum"));



CREATE INDEX "idx_orders_buyer_id" ON "public"."orders" USING "btree" ("buyer_id");



CREATE INDEX "idx_orders_merchant_id" ON "public"."orders" USING "btree" ("merchant_id");



CREATE INDEX "idx_orders_payment_reference" ON "public"."orders" USING "btree" ("payment_reference");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_products_available" ON "public"."products" USING "btree" ("is_available") WHERE ("is_available" = true);



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_products_merchant" ON "public"."products" USING "btree" ("merchant_id");



CREATE INDEX "idx_products_tags" ON "public"."products" USING "gin" ("tags");



CREATE INDEX "idx_profiles_id_cards" ON "public"."id_cards" USING "btree" ("profile_id");



CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone_number");



CREATE INDEX "idx_push_tokens_active" ON "public"."push_tokens" USING "btree" ("user_id", "is_active");



CREATE INDEX "idx_push_tokens_token" ON "public"."push_tokens" USING "btree" ("token") WHERE ("is_active" = true);



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_ride_notifications_driver" ON "public"."ride_request_notifications" USING "btree" ("driver_id", "status");



CREATE INDEX "idx_ride_notifications_request" ON "public"."ride_request_notifications" USING "btree" ("ride_request_id", "status");



CREATE INDEX "idx_rides_order_id" ON "public"."rides" USING "btree" ("order_id");



CREATE INDEX "idx_roles_name" ON "public"."roles" USING "btree" ("name");



CREATE INDEX "idx_saved_addresses_user" ON "public"."saved_addresses" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_reference" ON "public"."transactions" USING "btree" ("provider_reference");



CREATE INDEX "idx_trips_driver_id" ON "public"."trips" USING "btree" ("driver_id");



CREATE INDEX "idx_trips_rider_id" ON "public"."trips" USING "btree" ("rider_id");



CREATE INDEX "idx_trips_status" ON "public"."trips" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_user_default_address" ON "public"."saved_addresses" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE INDEX "idx_user_discounts_user" ON "public"."user_discounts" USING "btree" ("user_id");



CREATE INDEX "idx_user_role_events_event_at" ON "public"."user_role_events" USING "btree" ("event_at");



CREATE INDEX "idx_user_role_events_profile" ON "public"."user_role_events" USING "btree" ("profile_id");



CREATE INDEX "idx_user_role_events_role" ON "public"."user_role_events" USING "btree" ("role_id");



CREATE INDEX "idx_user_roles_profile_id" ON "public"."user_roles" USING "btree" ("profile_id");



CREATE INDEX "idx_user_roles_role_id" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_user_success_events_user" ON "public"."user_success_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "one_pending_payout_per_wallet" ON "public"."payout_requests" USING "btree" ("wallet_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "orders_driver_accepted_at_idx" ON "public"."orders" USING "btree" ("driver_accepted_at");



CREATE INDEX "orders_driver_id_idx" ON "public"."orders" USING "btree" ("driver_id");



CREATE INDEX "orders_status_idx" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "paystack_webhook_logs_event_type_transfer_code_idx" ON "public"."paystack_webhook_logs" USING "btree" ("event_type", "transfer_code");



CREATE UNIQUE INDEX "profiles_referral_code_key" ON "public"."profiles" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "trip_driver_queue_status_idx" ON "public"."trip_driver_queue" USING "btree" ("status");



CREATE INDEX "trip_driver_queue_trip_id_idx" ON "public"."trip_driver_queue" USING "btree" ("trip_id");



CREATE INDEX "trip_driver_queue_trip_id_position_idx" ON "public"."trip_driver_queue" USING "btree" ("trip_id", "position");



CREATE UNIQUE INDEX "unique_wallet_reference" ON "public"."wallet_transactions" USING "btree" ("wallet_id", "reference_type", "reference_id");



CREATE OR REPLACE TRIGGER "drivers_set_updated_at" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "on_profile_created_buyer_info" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_profile_buyer_info"();



CREATE OR REPLACE TRIGGER "on_ride_cancelled" AFTER UPDATE ON "public"."ride_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ride_cancellation"();



CREATE OR REPLACE TRIGGER "on_ride_notification_update" BEFORE UPDATE ON "public"."ride_request_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ride_acceptance"();



CREATE OR REPLACE TRIGGER "on_seller_profile_update" AFTER UPDATE ON "public"."seller_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_seller_to_merchant"();



CREATE OR REPLACE TRIGGER "orders_generate_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_order_number"();



CREATE OR REPLACE TRIGGER "trg_validate_active_role" BEFORE INSERT OR UPDATE ON "public"."active_user_role" FOR EACH ROW EXECUTE FUNCTION "public"."validate_active_role"();



CREATE OR REPLACE TRIGGER "update_push_tokens_timestamp" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_push_token_timestamp"();



CREATE OR REPLACE TRIGGER "whatsapp_outgoing" AFTER INSERT ON "public"."support_messages" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://qpbspbbyxwsdxbeackto.supabase.co/functions/v1/whatsapp-chat-bridge', 'POST', '{"Content-type":"application/json","Authorization":"Bearer [YOUR API KEY]"}', '{}', '5000');



ALTER TABLE ONLY "public"."active_user_role"
    ADD CONSTRAINT "active_user_role_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."active_user_role"
    ADD CONSTRAINT "active_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."buyer_information"
    ADD CONSTRAINT "buyer_information_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_business_type_id_fkey" FOREIGN KEY ("business_type_id") REFERENCES "public"."business_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyer_information"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_notifications"
    ADD CONSTRAINT "emergency_notifications_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."id_cards"
    ADD CONSTRAINT "id_cards_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lease_requests"
    ADD CONSTRAINT "lease_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lease_requests"
    ADD CONSTRAINT "lease_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."lease_vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lease_vehicles"
    ADD CONSTRAINT "lease_vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."merchant_notifications"
    ADD CONSTRAINT "merchant_notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications_queue"
    ADD CONSTRAINT "notifications_queue_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."order_issues"
    ADD CONSTRAINT "order_issues_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_issues"
    ADD CONSTRAINT "order_issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_log"
    ADD CONSTRAINT "order_status_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_status"
    ADD CONSTRAINT "order_status_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyer_information"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_profiles_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");



ALTER TABLE ONLY "public"."paystack_recipients"
    ADD CONSTRAINT "paystack_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."paystack_recipients"
    ADD CONSTRAINT "paystack_recipients_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");



ALTER TABLE ONLY "public"."paystack_transfers"
    ADD CONSTRAINT "paystack_transfers_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."paystack_transfers"
    ADD CONSTRAINT "paystack_transfers_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_shares"
    ADD CONSTRAINT "product_shares_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_card_id_fkey" FOREIGN KEY ("id_card_id") REFERENCES "public"."id_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_usages"
    ADD CONSTRAINT "promotion_usages_promo_code_fkey" FOREIGN KEY ("promo_code") REFERENCES "public"."promotions"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_usages"
    ADD CONSTRAINT "promotion_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."push_notification_tokens"
    ADD CONSTRAINT "push_notification_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recent_locations"
    ADD CONSTRAINT "recent_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_links"
    ADD CONSTRAINT "referral_links_code_fk" FOREIGN KEY ("referral_code") REFERENCES "public"."referral_codes"("code");



ALTER TABLE ONLY "public"."referral_links"
    ADD CONSTRAINT "referral_links_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."referral_links"
    ADD CONSTRAINT "referral_links_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyer_information"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_buyer_id_profiles_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_cancelled_by_role_id_fkey" FOREIGN KEY ("cancelled_by_role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_driver_id_profiles_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_driver_responses"
    ADD CONSTRAINT "ride_driver_responses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_driver_responses"
    ADD CONSTRAINT "ride_driver_responses_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_request_notifications"
    ADD CONSTRAINT "ride_request_notifications_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_request_notifications"
    ADD CONSTRAINT "ride_request_notifications_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_requests"
    ADD CONSTRAINT "ride_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."ride_requests"
    ADD CONSTRAINT "ride_requests_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_search_attempts"
    ADD CONSTRAINT "ride_search_attempts_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_addresses"
    ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_payout_requests"
    ADD CONSTRAINT "seller_payout_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id");



ALTER TABLE ONLY "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_shares"
    ADD CONSTRAINT "store_shares_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_chats"
    ADD CONSTRAINT "support_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."support_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trip_driver_queue"
    ADD CONSTRAINT "trip_driver_queue_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_driver_queue"
    ADD CONSTRAINT "trip_driver_queue_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_payments"
    ADD CONSTRAINT "trip_payments_trip_quote_id_fkey" FOREIGN KEY ("trip_quote_id") REFERENCES "public"."trip_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_payments"
    ADD CONSTRAINT "trip_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_pricing_quotes"
    ADD CONSTRAINT "trip_pricing_quotes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_quotes"
    ADD CONSTRAINT "trip_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_trip_payment_id_fkey" FOREIGN KEY ("trip_payment_id") REFERENCES "public"."trip_payments"("id");



ALTER TABLE ONLY "public"."user_discounts"
    ADD CONSTRAINT "user_discounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_events"
    ADD CONSTRAINT "user_role_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_events"
    ADD CONSTRAINT "user_role_events_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_success_events"
    ADD CONSTRAINT "user_success_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id");



ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can delete business types" ON "public"."business_types" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete buyer info" ON "public"."buyer_information" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete categories" ON "public"."categories" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete driver info" ON "public"."drivers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete emergency contacts" ON "public"."emergency_contacts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete merchant info" ON "public"."merchants" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete products" ON "public"."products" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can delete rides" ON "public"."ride_bookings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can insert business types" ON "public"."business_types" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can insert categories" ON "public"."categories" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update any product" ON "public"."products" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update any ride" ON "public"."ride_bookings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update business types" ON "public"."business_types" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update categories" ON "public"."categories" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update driver sensitive fields" ON "public"."drivers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can update sensitive merchant fields" ON "public"."merchants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Admin can view all rides" ON "public"."ride_bookings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = "auth"."uid"()) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "Authenticated users can view merchants" ON "public"."merchants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Buyer can create ride requests" ON "public"."ride_bookings" FOR INSERT WITH CHECK (("buyer_id" = "auth"."uid"()));



CREATE POLICY "Buyer can insert own contacts" ON "public"."emergency_contacts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."buyer_information" "b"
  WHERE (("b"."id" = "emergency_contacts"."buyer_id") AND ("b"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Buyer can update own contacts" ON "public"."emergency_contacts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."buyer_information" "b"
  WHERE (("b"."id" = "emergency_contacts"."buyer_id") AND ("b"."id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."buyer_information" "b"
  WHERE (("b"."id" = "emergency_contacts"."buyer_id") AND ("b"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Buyer can view own contacts" ON "public"."emergency_contacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."buyer_information" "b"
  WHERE (("b"."id" = "emergency_contacts"."buyer_id") AND ("b"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Can create phone OTPs" ON "public"."phone_otps" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Can delete phone OTPs" ON "public"."phone_otps" FOR DELETE TO "service_role" USING (true);



CREATE POLICY "Can read phone OTPs" ON "public"."phone_otps" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Driver can insert own info" ON "public"."drivers" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Driver can read assigned trips" ON "public"."trips" FOR SELECT USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Driver can update own status and location" ON "public"."drivers" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Driver can view assigned rides" ON "public"."ride_bookings" FOR SELECT USING (("driver_id" = "auth"."uid"()));



CREATE POLICY "Driver can view own info" ON "public"."drivers" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Drivers can respond to ride requests" ON "public"."ride_driver_responses" FOR INSERT WITH CHECK (("driver_id" = "auth"."uid"()));



CREATE POLICY "Drivers can update assigned orders" ON "public"."orders" FOR UPDATE USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can update their assigned ride bookings" ON "public"."ride_bookings" FOR UPDATE TO "authenticated" USING (("driver_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("driver_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Drivers can update their own profile" ON "public"."drivers" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Drivers can update their ride notifications" ON "public"."ride_request_notifications" FOR UPDATE USING (("driver_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("driver_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Drivers can view assigned buyer profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."buyer_id" = "profiles"."id") AND ("orders"."driver_id" = "auth"."uid"())))));



CREATE POLICY "Drivers can view assigned orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can view notified ride bookings" ON "public"."ride_bookings" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."ride_request_notifications" "rrn"
  WHERE (("rrn"."ride_request_id" = "ride_bookings"."id") AND ("rrn"."driver_id" = "auth"."uid"())))) OR ("driver_id" = "auth"."uid"())));



CREATE POLICY "Drivers can view their ride notifications" ON "public"."ride_request_notifications" FOR SELECT USING (("driver_id" = "auth"."uid"()));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."products" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "merchant_id"));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."lease_vehicles" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for everyone" ON "public"."admin_alerts" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable insert for everyone" ON "public"."api_errors" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."business_types" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."lease_vehicles" FOR SELECT USING (true);



CREATE POLICY "Enable read access for buyers to their own orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Enable read for authenticated" ON "public"."admin_alerts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read for authenticated" ON "public"."api_errors" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update for owners" ON "public"."lease_vehicles" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Everyone can view available products" ON "public"."products" FOR SELECT USING (("is_available" = true));



CREATE POLICY "Everyone can view business types" ON "public"."business_types" FOR SELECT USING (true);



CREATE POLICY "Everyone can view categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Merchant can insert own info" ON "public"."merchants" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Merchant can insert own products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("merchant_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Merchant can update own info" ON "public"."merchants" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "owner_id") OR (( SELECT "auth"."uid"() AS "uid") = "id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "owner_id") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "Merchant can update own products" ON "public"."products" FOR UPDATE TO "authenticated" USING (("merchant_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("merchant_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Merchant can view own info" ON "public"."merchants" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "owner_id") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "Merchants view their shares" ON "public"."store_shares" FOR SELECT USING (true);



CREATE POLICY "Owners can select their own merchant profile" ON "public"."merchants" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Public can view merchants" ON "public"."merchants" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public insert for product shares" ON "public"."product_shares" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public insert for store shares" ON "public"."store_shares" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public view for product shares" ON "public"."product_shares" FOR SELECT USING (true);



CREATE POLICY "Rider can create trip" ON "public"."trips" FOR INSERT WITH CHECK (("auth"."uid"() = "rider_id"));



CREATE POLICY "Rider can read own pricing quotes" ON "public"."trip_pricing_quotes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "trip_pricing_quotes"."trip_id") AND ("trips"."rider_id" = "auth"."uid"())))));



CREATE POLICY "Rider can read own trips" ON "public"."trips" FOR SELECT USING (("auth"."uid"() = "rider_id"));



CREATE POLICY "Riders can create ride bookings" ON "public"."ride_bookings" FOR INSERT TO "authenticated" WITH CHECK (("buyer_id" = "auth"."uid"()));



CREATE POLICY "Riders can update their own ride bookings" ON "public"."ride_bookings" FOR UPDATE TO "authenticated" USING (("buyer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("buyer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Riders can view responses for their rides" ON "public"."ride_driver_responses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_driver_responses"."ride_id") AND ("r"."rider_id" = "auth"."uid"())))));



CREATE POLICY "Riders can view their own ride bookings" ON "public"."ride_bookings" FOR SELECT TO "authenticated" USING (("buyer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Riders can view their own search attempts" ON "public"."ride_search_attempts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_search_attempts"."ride_id") AND ("r"."rider_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can view requests related to them" ON "public"."review_requests" FOR SELECT USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers request payouts" ON "public"."seller_payout_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."seller_profiles"
  WHERE (("seller_profiles"."id" = "seller_payout_requests"."seller_id") AND ("seller_profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Sellers view own payouts" ON "public"."seller_payout_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."seller_profiles"
  WHERE (("seller_profiles"."id" = "seller_payout_requests"."seller_id") AND ("seller_profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Service role access" ON "public"."outbox_events" USING (true);



CREATE POLICY "Service role access notifications" ON "public"."notifications_queue" USING (true);



CREATE POLICY "Service role can manage emergency notifications" ON "public"."emergency_notifications" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage ride notifications" ON "public"."ride_request_notifications" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."push_tokens" TO "service_role" USING (true);



CREATE POLICY "System insert logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "User can delete own ID card" ON "public"."id_cards" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can delete own addresses" ON "public"."saved_addresses" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "User can delete own profile" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can delete own token" ON "public"."push_notification_tokens" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can insert own ID card" ON "public"."id_cards" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can insert own addresses" ON "public"."saved_addresses" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "User can insert own buyer info" ON "public"."buyer_information" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can insert own token" ON "public"."push_notification_tokens" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can read own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can read own tokens" ON "public"."push_notification_tokens" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can switch own active role" ON "public"."active_user_role" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can update own ID card" ON "public"."id_cards" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can update own addresses" ON "public"."saved_addresses" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "User can update own buyer info" ON "public"."buyer_information" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can update own token" ON "public"."push_notification_tokens" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can view own ID cards" ON "public"."id_cards" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can view own active role" ON "public"."active_user_role" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "profile_id"));



CREATE POLICY "User can view own addresses" ON "public"."saved_addresses" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "User can view own buyer info" ON "public"."buyer_information" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "User can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can create own withdrawals" ON "public"."withdrawals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create requests" ON "public"."lease_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own order issues" ON "public"."order_issues" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users can create their own support chats" ON "public"."support_chats" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own payment methods" ON "public"."payment_methods" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own saved addresses" ON "public"."saved_addresses" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own payment methods" ON "public"."payment_methods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own saved addresses" ON "public"."saved_addresses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own trip payments" ON "public"."trip_payments" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert status logs" ON "public"."order_status_log" FOR INSERT WITH CHECK (("auth"."uid"() = "changed_by"));



CREATE POLICY "Users can read their own recipients" ON "public"."paystack_recipients" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can send messages to their chats" ON "public"."support_messages" FOR INSERT WITH CHECK ((("sender_type" = 'user'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."support_chats"
  WHERE (("support_chats"."id" = "support_messages"."chat_id") AND ("support_chats"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own payment methods" ON "public"."payment_methods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own saved addresses" ON "public"."saved_addresses" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own trip payments" ON "public"."trip_payments" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own order issues" ON "public"."order_issues" FOR UPDATE USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users can update their own review requests" ON "public"."review_requests" FOR UPDATE USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users can view messages in their chats" ON "public"."support_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."support_chats"
  WHERE (("support_chats"."id" = "support_messages"."chat_id") AND ("support_chats"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own payment methods" ON "public"."payment_methods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own saved addresses" ON "public"."saved_addresses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own trip payments" ON "public"."trip_payments" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own withdrawals" ON "public"."withdrawals" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view relevant status logs" ON "public"."order_status_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_status_log"."order_id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."driver_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own order issues" ON "public"."order_issues" FOR SELECT USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users can view their own requests" ON "public"."lease_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own review requests" ON "public"."review_requests" FOR SELECT USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Users can view their own support chats" ON "public"."support_chats" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own seller profile" ON "public"."seller_profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "profile_id")));



CREATE POLICY "Users manage own push tokens" ON "public"."push_tokens" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users modify own locations" ON "public"."recent_locations" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own seller profile" ON "public"."seller_profiles" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "profile_id")));



CREATE POLICY "Users view own seller profile" ON "public"."seller_profiles" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "profile_id")));



CREATE POLICY "Users view their own logs" ON "public"."audit_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Vehicle owners can view requests for their vehicles" ON "public"."lease_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lease_vehicles" "v"
  WHERE (("v"."id" = "lease_requests"."vehicle_id") AND ("v"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."active_user_role" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_full_access_attachments" ON "public"."attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "admin_full_access_deliveries" ON "public"."deliveries" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "admin_full_access_logs" ON "public"."order_status_log" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "admin_full_access_order_items" ON "public"."order_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "admin_full_access_status" ON "public"."order_status" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "admin_full_access_transactions" ON "public"."transactions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "anyone can view roles" ON "public"."roles" FOR SELECT USING (true);



ALTER TABLE "public"."api_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buyer_information" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_select_assigned_deliveries" ON "public"."deliveries" FOR SELECT TO "authenticated" USING (("driver_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "driver_select_attachments" ON "public"."attachments" FOR SELECT TO "authenticated" USING (("order_id" IN ( SELECT "deliveries"."order_id"
   FROM "public"."deliveries"
  WHERE ("deliveries"."driver_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "driver_select_transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("order_id" IN ( SELECT "deliveries"."order_id"
   FROM "public"."deliveries"
  WHERE ("deliveries"."driver_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drivers_read_public" ON "public"."drivers" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."emergency_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emergency_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."id_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own user_role_events" ON "public"."user_role_events" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "insert_all_orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."active_user_role" "aur"
     JOIN "public"."roles" "r" ON (("r"."id" = "aur"."role_id")))
  WHERE (("aur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "insert_own_orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("buyer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."lease_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lease_vehicles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."merchant_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "merchant_select_order_items" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("merchant_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outbox_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paystack_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paystack_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paystack_webhook_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."phone_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_usages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotions_insert_policy" ON "public"."promotions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = ANY (ARRAY['admin'::"text", 'merchant'::"text"]))))));



CREATE POLICY "promotions_select_policy" ON "public"."promotions" FOR SELECT USING (("active" = true));



CREATE POLICY "promotions_update_policy" ON "public"."promotions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = ANY (ARRAY['admin'::"text", 'merchant'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = ANY (ARRAY['admin'::"text", 'merchant'::"text"]))))));



ALTER TABLE "public"."push_notification_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read own user_role_events" ON "public"."user_role_events" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."recent_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_driver_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_request_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_search_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_all_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."active_user_role" "aur"
     JOIN "public"."roles" "r" ON (("r"."id" = "aur"."role_id")))
  WHERE (("aur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "select_merchant_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("merchant_id" IN ( SELECT "merchants"."id"
   FROM "public"."merchants"
  WHERE ("merchants"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "select_own_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("buyer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."seller_payout_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_insert_status" ON "public"."order_status" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'system'::"text")))));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_driver_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_pricing_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_all_orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."active_user_role" "aur"
     JOIN "public"."roles" "r" ON (("r"."id" = "aur"."role_id")))
  WHERE (("aur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."active_user_role" "aur"
     JOIN "public"."roles" "r" ON (("r"."id" = "aur"."role_id")))
  WHERE (("aur"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("r"."name")::"text" = 'admin'::"text")))));



CREATE POLICY "update_merchant_orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("merchant_id" IN ( SELECT "merchants"."id"
   FROM "public"."merchants"
  WHERE ("merchants"."id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("merchant_id" IN ( SELECT "merchants"."id"
   FROM "public"."merchants"
  WHERE ("merchants"."id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "update_own_orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("buyer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("buyer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "upsert own active role" ON "public"."active_user_role" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."user_discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_role_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_success_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ride_bookings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ride_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."support_chats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."support_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trip_payments";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("path") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "service_role";


















































































































































































































GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."addauth"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_active_role"("p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."assert_active_role"("p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_active_role"("p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_driver_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_driver_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_driver_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_distance_km_inline"("pickup_input" "public"."geography", "dropoff_input" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_distance_km_inline"("pickup_input" "public"."geography", "dropoff_input" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_distance_km_inline"("pickup_input" "public"."geography", "dropoff_input" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_fare"("p_pickup" "public"."geography", "p_dropoff" "public"."geography", "p_base_fare" numeric, "p_per_km_rate" numeric, "p_minimum_fare" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_fare"("p_pickup" "public"."geography", "p_dropoff" "public"."geography", "p_base_fare" numeric, "p_per_km_rate" numeric, "p_minimum_fare" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_fare"("p_pickup" "public"."geography", "p_dropoff" "public"."geography", "p_base_fare" numeric, "p_per_km_rate" numeric, "p_minimum_fare" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_surge_multiplier"("p_hour" integer, "p_demand_ratio" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_surge_multiplier"("p_hour" integer, "p_demand_ratio" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_surge_multiplier"("p_hour" integer, "p_demand_ratio" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_ride_request"("p_ride_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_ride_request"("p_ride_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_ride_request"("p_ride_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_payment"("p_reference" "text", "p_amount" numeric, "p_provider_response" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_payment"("p_reference" "text", "p_amount" numeric, "p_provider_response" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_payment"("p_reference" "text", "p_amount" numeric, "p_provider_response" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ride"("rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."create_ride"("rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ride"("rider_id" "uuid", "pickup_lat" double precision, "pickup_lng" double precision, "dropoff_lat" double precision, "dropoff_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_wallet"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_active_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_active_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_active_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_wallet_balance"("uid" "uuid", "amt" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_wallet_balance"("uid" "uuid", "amt" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_wallet_balance"("uid" "uuid", "amt" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_old_ride_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_ride_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_ride_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_wallet_balance"("uid" "uuid", "amt" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_wallet_balance"("uid" "uuid", "amt" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_wallet_balance"("uid" "uuid", "amt" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geography", "p_service_tier" "text", "p_max_distance_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geography", "p_service_tier" "text", "p_max_distance_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geography", "p_service_tier" "text", "p_max_distance_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geometry", "p_service_tier" "text", "p_max_distance_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geometry", "p_service_tier" "text", "p_max_distance_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_eligible_drivers"("p_pickup" "public"."geometry", "p_service_tier" "text", "p_max_distance_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_nearby_drivers"("pickup_lat" double precision, "pickup_lng" double precision, "max_distance_m" integer, "vehicle_type" "text", "service_mode" "text", "min_last_seen_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_nearby_drivers"("pickup_lat" double precision, "pickup_lng" double precision, "max_distance_m" integer, "vehicle_type" "text", "service_mode" "text", "min_last_seen_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_nearby_drivers"("pickup_lat" double precision, "pickup_lng" double precision, "max_distance_m" integer, "vehicle_type" "text", "service_mode" "text", "min_last_seen_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auth_user_by_phone"("p_phone" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_auth_user_by_phone"("p_phone" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auth_user_by_phone"("p_phone" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_wallet_and_earnings"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "postgres";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "anon";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_profile_buyer_info"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_profile_buyer_info"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_profile_buyer_info"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ride_acceptance"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ride_acceptance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ride_acceptance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ride_cancellation"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ride_cancellation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ride_cancellation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hello_world"("name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hello_world"("name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hello_world"("name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."init_payout"("p_user_id" "uuid", "p_amount" numeric, "p_recipient_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."init_payout"("p_user_id" "uuid", "p_amount" numeric, "p_recipient_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_payout"("p_user_id" "uuid", "p_amount" numeric, "p_recipient_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_wallet_balance"("wallet_id" "uuid", "amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."lock_wallet_balance"("wallet_id" "uuid", "amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_wallet_balance"("wallet_id" "uuid", "amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "postgres";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merchant_update_order"("p_order_id" "uuid", "p_action" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."merchant_update_order"("p_order_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merchant_update_order"("p_order_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."order_quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_requires_delivery" boolean, "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "public"."delivery_type_enum", "p_promo_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."order_quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_requires_delivery" boolean, "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "public"."delivery_type_enum", "p_promo_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_requires_delivery" boolean, "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "public"."delivery_type_enum", "p_promo_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON TABLE "public"."paystack_transfers" TO "anon";
GRANT ALL ON TABLE "public"."paystack_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."paystack_transfers" TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_attach_transfer_code"("p_idempotency_key" "text", "p_transfer_code" "text", "p_external_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_attach_transfer_code"("p_idempotency_key" "text", "p_transfer_code" "text", "p_external_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_attach_transfer_code"("p_idempotency_key" "text", "p_transfer_code" "text", "p_external_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_finalize_failed"("p_transfer_code" "text", "p_webhook" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_finalize_failed"("p_transfer_code" "text", "p_webhook" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_finalize_failed"("p_transfer_code" "text", "p_webhook" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_finalize_success"("p_transfer_code" "text", "p_webhook" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_finalize_success"("p_transfer_code" "text", "p_webhook" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_finalize_success"("p_transfer_code" "text", "p_webhook" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_initiate"("p_wallet_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_recipient_code" "text", "p_reason" "text", "p_idempotency_key" "text", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_initiate"("p_wallet_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_recipient_code" "text", "p_reason" "text", "p_idempotency_key" "text", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_initiate"("p_wallet_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_recipient_code" "text", "p_reason" "text", "p_idempotency_key" "text", "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."place_order_tx"("p_buyer_id" "uuid", "p_quote" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."place_order_tx"("p_buyer_id" "uuid", "p_quote" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order_tx"("p_buyer_id" "uuid", "p_quote" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_transaction_split"("p_tx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_transaction_split"("p_tx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_transaction_split"("p_tx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_transaction_split-old"("p_tx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_transaction_split-old"("p_tx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_transaction_split-old"("p_tx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."quote-1"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."quote-1"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote-1"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."quote-old-latest"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."quote-old-latest"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quote-old-latest"("p_buyer_id" "uuid", "p_items" "jsonb", "p_delivery_lat" numeric, "p_delivery_lng" numeric, "p_delivery_type" "text", "p_promo_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reduce_order_stock"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reduce_order_stock"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reduce_order_stock"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reduce_stock_for_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reduce_stock_for_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reduce_stock_for_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_payout"("p_reference" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_payout"("p_reference" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_payout"("p_reference" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_funds_with_log"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_funds_with_log"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_funds_with_log"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_funds_with_log-old"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_funds_with_log-old"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_funds_with_log-old"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_payout"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."request_payout"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_payout"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_withdrawal"("p_user_id" "uuid", "p_payment_method_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."request_withdrawal"("p_user_id" "uuid", "p_payment_method_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_withdrawal"("p_user_id" "uuid", "p_payment_method_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."reward_referral_wallet"("referral_id" "uuid", "amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."reward_referral_wallet"("referral_id" "uuid", "amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reward_referral_wallet"("referral_id" "uuid", "amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rollback_wallet_balance"("uid" "uuid", "amt" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."rollback_wallet_balance"("uid" "uuid", "amt" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollback_wallet_balance"("uid" "uuid", "amt" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_ride_tx"("p_ride_id" "uuid", "p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_active_role"("p_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_active_role"("p_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_active_role"("p_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_active_role_old"("p_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_active_role_old"("p_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_active_role_old"("p_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_seller_to_merchant"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_seller_to_merchant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_seller_to_merchant"() TO "service_role";



GRANT ALL ON TABLE "public"."trip_payments" TO "anon";
GRANT ALL ON TABLE "public"."trip_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_payments" TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_payment_finalize"("p_trip_payment_id" "uuid", "p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trip_payment_finalize"("p_trip_payment_id" "uuid", "p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_payment_finalize"("p_trip_payment_id" "uuid", "p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_payment_refund"("p_trip_payment_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trip_payment_refund"("p_trip_payment_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_payment_refund"("p_trip_payment_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."unlock_wallet_balance"("uid" "uuid", "amt" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."unlock_wallet_balance"("uid" "uuid", "amt" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlock_wallet_balance"("uid" "uuid", "amt" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_driver_status"("p_driver_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."update_driver_status"("p_driver_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_driver_status"("p_driver_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_push_token_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_push_token_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_push_token_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ride_status"("p_ride_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_ride_status"("p_ride_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ride_status"("p_ride_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_location"("user_id" "uuid", "point_wkt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_location"("user_id" "uuid", "point_wkt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_location"("user_id" "uuid", "point_wkt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_active_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_active_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_active_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_delivery_otp"("p_ride_request_id" "uuid", "p_delivery_otp" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."verify_delivery_otp"("p_ride_request_id" "uuid", "p_delivery_otp" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_delivery_otp"("p_ride_request_id" "uuid", "p_delivery_otp" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_pickup_and_start_ride"("p_ride_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_pickup_and_start_ride"("p_ride_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_pickup_and_start_ride"("p_ride_request_id" "uuid") TO "service_role";












GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "service_role";





















GRANT ALL ON TABLE "public"."active_user_role" TO "anon";
GRANT ALL ON TABLE "public"."active_user_role" TO "authenticated";
GRANT ALL ON TABLE "public"."active_user_role" TO "service_role";



GRANT ALL ON TABLE "public"."admin_alerts" TO "anon";
GRANT ALL ON TABLE "public"."admin_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."api_errors" TO "anon";
GRANT ALL ON TABLE "public"."api_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."api_errors" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."business_types" TO "anon";
GRANT ALL ON TABLE "public"."business_types" TO "authenticated";
GRANT ALL ON TABLE "public"."business_types" TO "service_role";



GRANT ALL ON TABLE "public"."buyer_information" TO "anon";
GRANT ALL ON TABLE "public"."buyer_information" TO "authenticated";
GRANT ALL ON TABLE "public"."buyer_information" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_contacts" TO "anon";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_notifications" TO "anon";
GRANT ALL ON TABLE "public"."emergency_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."id_cards" TO "anon";
GRANT ALL ON TABLE "public"."id_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."id_cards" TO "service_role";



GRANT ALL ON TABLE "public"."lease_requests" TO "anon";
GRANT ALL ON TABLE "public"."lease_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_requests" TO "service_role";



GRANT ALL ON TABLE "public"."lease_vehicles" TO "anon";
GRANT ALL ON TABLE "public"."lease_vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."merchant_notifications" TO "anon";
GRANT ALL ON TABLE "public"."merchant_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."merchants" TO "anon";
GRANT ALL ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";



GRANT ALL ON TABLE "public"."notifications_queue" TO "anon";
GRANT ALL ON TABLE "public"."notifications_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_issues" TO "anon";
GRANT ALL ON TABLE "public"."order_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."order_issues" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_status" TO "anon";
GRANT ALL ON TABLE "public"."order_status" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_log" TO "anon";
GRANT ALL ON TABLE "public"."order_status_log" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_log" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."outbox_events" TO "anon";
GRANT ALL ON TABLE "public"."outbox_events" TO "authenticated";
GRANT ALL ON TABLE "public"."outbox_events" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payout_requests" TO "anon";
GRANT ALL ON TABLE "public"."payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."paystack_recipients" TO "anon";
GRANT ALL ON TABLE "public"."paystack_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."paystack_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."paystack_webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."paystack_webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."paystack_webhook_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."paystack_webhook_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."paystack_webhook_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."paystack_webhook_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."phone_otps" TO "anon";
GRANT ALL ON TABLE "public"."phone_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_otps" TO "service_role";



GRANT ALL ON TABLE "public"."product_shares" TO "anon";
GRANT ALL ON TABLE "public"."product_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."product_shares" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_usages" TO "anon";
GRANT ALL ON TABLE "public"."promotion_usages" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_usages" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_notification_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_notification_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."recent_locations" TO "anon";
GRANT ALL ON TABLE "public"."recent_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_locations" TO "service_role";



GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";



GRANT ALL ON TABLE "public"."referral_links" TO "anon";
GRANT ALL ON TABLE "public"."referral_links" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_links" TO "service_role";



GRANT ALL ON TABLE "public"."review_requests" TO "anon";
GRANT ALL ON TABLE "public"."review_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."review_requests" TO "service_role";



GRANT ALL ON TABLE "public"."ride_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_bookings" TO "service_role";
GRANT ALL ON TABLE "public"."ride_bookings" TO "anon";



GRANT ALL ON TABLE "public"."ride_driver_responses" TO "anon";
GRANT ALL ON TABLE "public"."ride_driver_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_driver_responses" TO "service_role";



GRANT ALL ON TABLE "public"."ride_request_notifications" TO "anon";
GRANT ALL ON TABLE "public"."ride_request_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_request_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."ride_requests" TO "anon";
GRANT ALL ON TABLE "public"."ride_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_requests" TO "service_role";



GRANT ALL ON TABLE "public"."ride_search_attempts" TO "anon";
GRANT ALL ON TABLE "public"."ride_search_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_search_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."rides" TO "anon";
GRANT ALL ON TABLE "public"."rides" TO "authenticated";
GRANT ALL ON TABLE "public"."rides" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."saved_addresses" TO "anon";
GRANT ALL ON TABLE "public"."saved_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."seller_payout_requests" TO "anon";
GRANT ALL ON TABLE "public"."seller_payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_payout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."seller_profiles" TO "anon";
GRANT ALL ON TABLE "public"."seller_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."store_shares" TO "anon";
GRANT ALL ON TABLE "public"."store_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."store_shares" TO "service_role";



GRANT ALL ON TABLE "public"."support_chats" TO "anon";
GRANT ALL ON TABLE "public"."support_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."support_chats" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."system_config" TO "anon";
GRANT ALL ON TABLE "public"."system_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_config" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."trip_driver_queue" TO "anon";
GRANT ALL ON TABLE "public"."trip_driver_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_driver_queue" TO "service_role";



GRANT ALL ON TABLE "public"."trip_pricing_quotes" TO "anon";
GRANT ALL ON TABLE "public"."trip_pricing_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_pricing_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."trip_quotes" TO "anon";
GRANT ALL ON TABLE "public"."trip_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."user_discounts" TO "anon";
GRANT ALL ON TABLE "public"."user_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_discounts" TO "service_role";



GRANT ALL ON TABLE "public"."user_role_events" TO "anon";
GRANT ALL ON TABLE "public"."user_role_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_success_events" TO "anon";
GRANT ALL ON TABLE "public"."user_success_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_success_events" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



GRANT ALL ON TABLE "public"."withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawals" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































