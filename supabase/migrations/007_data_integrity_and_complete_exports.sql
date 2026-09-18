-- Data-integrity hardening for the completed primary-annotation phase.
-- Run this after 006_review_discussions.sql.

-- Keep annotator positions stable across every review. The earlier version
-- ordered annotators by each annotation's submission time, which could swap
-- the two raters between rows and distort Cohen's kappa marginals.
create or replace function public.annotation_pairs()
returns table (
  review_id bigint,
  annotator_1_id uuid,
  annotator_1_label public.annotation_label,
  annotator_2_id uuid,
  annotator_2_label public.annotation_label
)
language sql
stable
security definer
set search_path = public
as $$
  with primary_annotators as (
    select
      p.id,
      row_number() over (order by p.created_at, p.id) as annotator_number
    from public.profiles p
    where p.role = 'annotator'
  ),
  stable_annotations as (
    select a.review_id, a.annotator_id, a.label, p.annotator_number
    from public.annotations a
    join primary_annotators p on p.id = a.annotator_id
    where p.annotator_number <= 2
  )
  select
    one.review_id,
    one.annotator_id,
    one.label,
    two.annotator_id,
    two.label
  from stable_annotations one
  join stable_annotations two
    on two.review_id = one.review_id
   and two.annotator_number = 2
  where one.annotator_number = 1;
$$;

create or replace function public.primary_annotation_complete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.reviews r
    where r.active
      and not exists (
        select 1
        from public.annotation_pairs() p
        where p.review_id = r.id
      )
  );
$$;

create or replace function public.annotations_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.adjudications j
    join public.reviews r on r.id = j.review_id
    where r.active
  );
$$;

create or replace function public.valid_adjudication_target(target_review_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.primary_annotation_complete()
    and exists (
      select 1
      from public.annotation_pairs() p
      join public.reviews r on r.id = p.review_id
      where p.review_id = target_review_id
        and r.active
        and p.annotator_1_label <> p.annotator_2_label
    );
$$;

create or replace function public.annotation_workflow_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      (select count(*) from public.reviews r where r.active) as total_reviews,
      (
        select count(*)
        from public.annotation_pairs() p
        join public.reviews r on r.id = p.review_id
        where r.active
      ) as double_annotated
  )
  select jsonb_build_object(
    'total_reviews', counts.total_reviews,
    'double_annotated', counts.double_annotated,
    'annotation_complete', counts.total_reviews > 0 and counts.double_annotated = counts.total_reviews,
    'annotations_locked', public.annotations_locked()
  )
  from counts
  where auth.uid() is not null;
$$;

-- Progress should count only active reviews, matching the queue and dashboard.
create or replace function public.annotation_progress()
returns table (total bigint, completed bigint, skipped bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.reviews r where r.active),
    (
      select count(*)
      from public.annotations a
      join public.reviews r on r.id = a.review_id
      where a.annotator_id = auth.uid() and r.active
    ),
    (
      select count(*)
      from public.review_skips s
      join public.reviews r on r.id = s.review_id
      where s.annotator_id = auth.uid()
        and r.active
        and not exists (
          select 1
          from public.annotations a
          where a.review_id = s.review_id
            and a.annotator_id = auth.uid()
        )
    );
$$;

-- The third reviewer cannot begin until both primary annotators have completed
-- the same fixed candidate set.
create or replace function public.next_disagreement_for_current_user()
returns table (
  id bigint,
  candidate_id text,
  review_text text,
  source_tier text,
  annotator_1_label public.annotation_label,
  annotator_2_label public.annotation_label
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.candidate_id,
    r.review_text,
    r.source_tier,
    p.annotator_1_label,
    p.annotator_2_label
  from public.annotation_pairs() p
  join public.reviews r on r.id = p.review_id
  where public.current_app_role() = 'adjudicator'
    and public.primary_annotation_complete()
    and r.active
    and p.annotator_1_label <> p.annotator_2_label
    and not exists (
      select 1 from public.adjudications j where j.review_id = r.id
    )
  order by
    case r.source_tier
      when 'TIER_A_CONFIDENT' then 1
      when 'TIER_B_LIKELY' then 2
      when 'TIER_C_RECHECK' then 3
      else 4
    end,
    r.source_order,
    r.id
  limit 1;
$$;

-- Preserve the two original label sets once adjudication has begun.
drop policy if exists "annotators insert own annotations" on public.annotations;
drop policy if exists "annotators update own annotations" on public.annotations;
drop policy if exists "annotators delete own annotations" on public.annotations;

create policy "annotators insert own annotations" on public.annotations for insert
with check (
  annotator_id = auth.uid()
  and public.current_app_role() = 'annotator'
  and not public.annotations_locked()
);

create policy "annotators update own annotations" on public.annotations for update
using (
  annotator_id = auth.uid()
  and public.current_app_role() = 'annotator'
  and not public.annotations_locked()
)
with check (
  annotator_id = auth.uid()
  and public.current_app_role() = 'annotator'
  and not public.annotations_locked()
);

create policy "annotators delete own annotations" on public.annotations for delete
using (
  annotator_id = auth.uid()
  and public.current_app_role() = 'annotator'
  and not public.annotations_locked()
);

-- Adjudications must target genuine disagreements and cannot start early.
drop policy if exists "adjudicators insert final labels" on public.adjudications;
drop policy if exists "adjudicators update final labels" on public.adjudications;

create policy "adjudicators insert final labels" on public.adjudications for insert
with check (
  adjudicator_id = auth.uid()
  and public.current_app_role() = 'adjudicator'
  and public.valid_adjudication_target(review_id)
);

create policy "adjudicators update final labels" on public.adjudications for update
using (
  adjudicator_id = auth.uid()
  and public.current_app_role() = 'adjudicator'
  and public.valid_adjudication_target(review_id)
)
with check (
  adjudicator_id = auth.uid()
  and public.current_app_role() = 'adjudicator'
  and public.valid_adjudication_target(review_id)
);

-- The fast annotation RPC is SECURITY DEFINER, so it needs its own lock check.
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

  if public.annotations_locked() then
    raise exception 'Primary labels are locked because adjudication has begun';
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

-- Recalculate agreement over active reviews with stable rater identities.
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pairs as materialized (
    select p.*
    from public.annotation_pairs() p
    join public.reviews r on r.id = p.review_id
    where r.active
  ),
  totals as (
    select
      count(*)::numeric as n,
      count(*) filter (where annotator_1_label = annotator_2_label)::numeric as agreements
    from pairs
  ),
  marginals as (
    select
      labels.label,
      count(*) filter (where p.annotator_1_label = labels.label)::numeric as annotator_1_count,
      count(*) filter (where p.annotator_2_label = labels.label)::numeric as annotator_2_count
    from unnest(enum_range(null::public.annotation_label)) labels(label)
    left join pairs p on true
    group by labels.label
  ),
  reliability as (
    select
      t.n,
      t.agreements / nullif(t.n, 0) as observed_agreement,
      sum(m.annotator_1_count * m.annotator_2_count) / nullif(t.n * t.n, 0) as expected_agreement
    from totals t
    cross join marginals m
    group by t.n, t.agreements
  ),
  base as (
    select
      (select count(*) from public.reviews r where r.active) as total_reviews,
      (select count(*) from pairs) as double_annotated,
      (
        select count(*)
        from pairs p
        where p.annotator_1_label <> p.annotator_2_label
          and not exists (
            select 1 from public.adjudications j where j.review_id = p.review_id
          )
      ) as pending_disagreements,
      (
        select count(*)
        from public.adjudications j
        join public.reviews r on r.id = j.review_id
        where r.active
      ) as adjudicated
  )
  select case when public.current_app_role() <> 'admin' then null else jsonb_build_object(
    'total_reviews', base.total_reviews,
    'double_annotated', base.double_annotated,
    'pending_disagreements', base.pending_disagreements,
    'adjudicated', base.adjudicated,
    'annotation_kappa', case
      when reliability.n = 0 or 1 - reliability.expected_agreement = 0 then null
      else (reliability.observed_agreement - reliability.expected_agreement) / (1 - reliability.expected_agreement)
    end,
    'annotation_agreement_percent', round(100 * reliability.observed_agreement, 1),
    'annotators', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.display_name,
          'completed', coalesce(x.completed, 0)
        )
        order by p.created_at, p.id
      )
      from public.profiles p
      left join (
        select a.annotator_id, count(*) as completed
        from public.annotations a
        join public.reviews r on r.id = a.review_id
        where r.active
        group by a.annotator_id
      ) x on x.annotator_id = p.id
      where p.role = 'annotator'
    ), '[]'::jsonb)
  ) end
  from base
  cross join reliability;
$$;

-- Include stable annotator/adjudicator IDs and original source order so the
-- downloaded data is reproducible and auditable.
drop function if exists public.export_final_dataset();

create function public.export_final_dataset()
returns table (
  candidate_id text,
  review_text text,
  source_tier text,
  source_order integer,
  annotation_status text,
  annotator_1_id uuid,
  annotator_1_label public.annotation_label,
  annotator_2_id uuid,
  annotator_2_label public.annotation_label,
  adjudicator_id uuid,
  final_label public.annotation_label,
  included_in_binary_dataset boolean,
  binary_complaint_label integer
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select
      r.id,
      r.candidate_id,
      r.review_text,
      r.source_tier,
      r.source_order,
      p.annotator_1_id,
      p.annotator_1_label,
      p.annotator_2_id,
      p.annotator_2_label,
      j.adjudicator_id,
      case
        when j.review_id is not null then 'adjudicated'
        when p.review_id is null then 'incomplete'
        when p.annotator_1_label = p.annotator_2_label then 'agreed'
        else 'needs_adjudication'
      end as annotation_status,
      case
        when j.review_id is not null then j.final_label
        when p.annotator_1_label = p.annotator_2_label then p.annotator_1_label
        else null
      end as final_label
    from public.reviews r
    left join public.annotation_pairs() p on p.review_id = r.id
    left join public.adjudications j on j.review_id = r.id
    where public.current_app_role() = 'admin' and r.active
  )
  select
    candidate_id,
    review_text,
    source_tier,
    source_order,
    annotation_status,
    annotator_1_id,
    annotator_1_label,
    annotator_2_id,
    annotator_2_label,
    adjudicator_id,
    final_label,
    final_label in ('complaint', 'not_complaint') as included_in_binary_dataset,
    case final_label
      when 'complaint' then 1
      when 'not_complaint' then 0
      else null
    end as binary_complaint_label
  from resolved
  order by
    case source_tier
      when 'TIER_A_CONFIDENT' then 1
      when 'TIER_B_LIKELY' then 2
      when 'TIER_C_RECHECK' then 3
      else 4
    end,
    source_order,
    id;
$$;

revoke all on function public.annotation_pairs() from public;
revoke all on function public.primary_annotation_complete() from public;
revoke all on function public.annotations_locked() from public;
revoke all on function public.valid_adjudication_target(bigint) from public;
revoke all on function public.annotation_workflow_status() from public;
revoke all on function public.submit_annotation_and_next(bigint, public.annotation_label) from public;
revoke all on function public.export_final_dataset() from public;

grant execute on function public.annotation_progress() to authenticated;
grant execute on function public.next_disagreement_for_current_user() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.annotations_locked() to authenticated;
grant execute on function public.valid_adjudication_target(bigint) to authenticated;
grant execute on function public.annotation_workflow_status() to authenticated;
grant execute on function public.submit_annotation_and_next(bigint, public.annotation_label) to authenticated;
grant execute on function public.export_final_dataset() to authenticated;
