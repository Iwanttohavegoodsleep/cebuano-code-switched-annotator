-- Save an annotation (or skip) and return the next review in one round trip.
-- The operations run in one transaction, so the queue cannot advance unless
-- the annotation or skip was saved successfully.

create or replace function public.submit_annotation_and_next(
  target_review_id bigint,
  target_label public.annotation_label
)
returns table (
  id bigint,
  candidate_id text,
  review_text text,
  source_tier text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or public.current_app_role() <> 'annotator' then
    raise exception 'Only signed-in annotators can submit annotations';
  end if;

  if not exists (
    select 1 from public.reviews r
    where r.id = target_review_id and r.active
  ) then
    raise exception 'The selected review is not available';
  end if;

  insert into public.annotations (
    review_id,
    annotator_id,
    label,
    created_at,
    updated_at
  )
  values (
    target_review_id,
    current_user_id,
    target_label,
    now(),
    now()
  )
  on conflict (review_id, annotator_id) do update
  set label = excluded.label,
      updated_at = excluded.updated_at;

  delete from public.review_skips s
  where s.review_id = target_review_id
    and s.annotator_id = current_user_id;

  return query
  select r.id, r.candidate_id, r.review_text, r.source_tier
  from public.reviews r
  left join public.review_skips s
    on s.review_id = r.id and s.annotator_id = current_user_id
  where r.active
    and not exists (
      select 1 from public.annotations a
      where a.review_id = r.id and a.annotator_id = current_user_id
    )
  order by
    case when s.review_id is null then 0 else 1 end,
    case r.source_tier
      when 'TIER_A_CONFIDENT' then 1
      when 'TIER_B_LIKELY' then 2
      when 'TIER_C_RECHECK' then 3
      else 4
    end,
    case
      when s.review_id is null then r.source_order
      else extract(epoch from s.skipped_at)::integer
    end,
    r.id
  limit 1;
end;
$$;

create or replace function public.skip_review_and_next(target_review_id bigint)
returns table (
  id bigint,
  candidate_id text,
  review_text text,
  source_tier text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or public.current_app_role() <> 'annotator' then
    raise exception 'Only signed-in annotators can skip reviews';
  end if;

  if not exists (
    select 1 from public.reviews r
    where r.id = target_review_id and r.active
  ) then
    raise exception 'The selected review is not available';
  end if;

  insert into public.review_skips (review_id, annotator_id, skipped_at)
  values (target_review_id, current_user_id, now())
  on conflict (review_id, annotator_id) do update
  set skipped_at = excluded.skipped_at;

  return query
  select r.id, r.candidate_id, r.review_text, r.source_tier
  from public.reviews r
  left join public.review_skips s
    on s.review_id = r.id and s.annotator_id = current_user_id
  where r.active
    and r.id <> target_review_id
    and not exists (
      select 1 from public.annotations a
      where a.review_id = r.id and a.annotator_id = current_user_id
    )
  order by
    case when s.review_id is null then 0 else 1 end,
    case r.source_tier
      when 'TIER_A_CONFIDENT' then 1
      when 'TIER_B_LIKELY' then 2
      when 'TIER_C_RECHECK' then 3
      else 4
    end,
    case
      when s.review_id is null then r.source_order
      else extract(epoch from s.skipped_at)::integer
    end,
    r.id
  limit 1;
end;
$$;

revoke all on function public.submit_annotation_and_next(bigint, public.annotation_label) from public;
revoke all on function public.skip_review_and_next(bigint) from public;
grant execute on function public.submit_annotation_and_next(bigint, public.annotation_label) to authenticated;
grant execute on function public.skip_review_and_next(bigint) to authenticated;
