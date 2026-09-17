-- Upgrade the original binary workflow to one three-category annotation.
-- Run this after 001_initial_schema.sql. Existing Yes/No labels are preserved.

do $$ begin
  create type public.annotation_label as enum (
    'complaint',
    'not_complaint',
    'not_cebuano_english'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.annotations
  add column if not exists label public.annotation_label;

update public.annotations
set label = case
  when complaint_present then 'complaint'::public.annotation_label
  else 'not_complaint'::public.annotation_label
end
where label is null;

alter table public.annotations alter column label set not null;
alter table public.annotations drop column if exists complaint_present;

alter table public.adjudications
  add column if not exists final_label public.annotation_label;

update public.adjudications
set final_label = case
  when final_complaint_present then 'complaint'::public.annotation_label
  else 'not_complaint'::public.annotation_label
end
where final_label is null;

alter table public.adjudications alter column final_label set not null;
alter table public.adjudications drop column if exists final_complaint_present;

drop function if exists public.next_disagreement_for_current_user();
drop function if exists public.admin_overview();
drop function if exists public.export_final_dataset();
drop function if exists public.annotation_pairs();

create or replace function public.annotation_pairs()
returns table (
  review_id bigint,
  annotator_1_id uuid, annotator_1_label public.annotation_label,
  annotator_2_id uuid, annotator_2_label public.annotation_label
)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select a.*, row_number() over (partition by a.review_id order by a.created_at, a.annotator_id) as rn
    from public.annotations a
    join public.profiles p on p.id = a.annotator_id and p.role = 'annotator'
  )
  select one.review_id,
    one.annotator_id, one.label,
    two.annotator_id, two.label
  from ranked one join ranked two on two.review_id = one.review_id and two.rn = 2
  where one.rn = 1;
$$;

create or replace function public.next_disagreement_for_current_user()
returns table (
  id bigint, candidate_id text, review_text text, source_tier text,
  annotator_1_label public.annotation_label,
  annotator_2_label public.annotation_label
)
language sql stable security definer set search_path = public as $$
  select r.id, r.candidate_id, r.review_text, r.source_tier,
    p.annotator_1_label, p.annotator_2_label
  from public.annotation_pairs() p
  join public.reviews r on r.id = p.review_id
  where public.current_app_role() = 'adjudicator'
    and p.annotator_1_label <> p.annotator_2_label
    and not exists (select 1 from public.adjudications j where j.review_id = r.id)
  order by case r.source_tier when 'TIER_A_CONFIDENT' then 1 when 'TIER_B_LIKELY' then 2 when 'TIER_C_RECHECK' then 3 else 4 end,
    r.source_order, r.id
  limit 1;
$$;

create or replace function public.admin_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with pairs as materialized (select * from public.annotation_pairs()),
  totals as (
    select
      count(*)::numeric as n,
      count(*) filter (where annotator_1_label = annotator_2_label)::numeric as agreements
    from pairs
  ),
  marginals as (
    select labels.label,
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
    from totals t cross join marginals m
    group by t.n, t.agreements
  ),
  base as (
    select
      (select count(*) from public.reviews where active) total_reviews,
      (select count(*) from pairs) double_annotated,
      (select count(*) from pairs p where p.annotator_1_label <> p.annotator_2_label and not exists (select 1 from public.adjudications j where j.review_id = p.review_id)) pending_disagreements,
      (select count(*) from public.adjudications) adjudicated
  )
  select case when public.current_app_role() <> 'admin' then null else jsonb_build_object(
    'total_reviews', base.total_reviews,
    'double_annotated', base.double_annotated,
    'pending_disagreements', base.pending_disagreements,
    'adjudicated', base.adjudicated,
    'annotation_kappa', case
      when r.n = 0 or 1 - r.expected_agreement = 0 then null
      else (r.observed_agreement - r.expected_agreement) / (1 - r.expected_agreement)
    end,
    'annotation_agreement_percent', round(100 * r.observed_agreement, 1),
    'annotators', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'completed', coalesce(x.completed,0)) order by p.created_at)
      from public.profiles p
      left join (select annotator_id, count(*) completed from public.annotations group by annotator_id) x on x.annotator_id = p.id
      where p.role = 'annotator'
    ), '[]'::jsonb)
  ) end
  from base cross join reliability r;
$$;

create or replace function public.export_final_dataset()
returns table (
  candidate_id text,
  review_text text,
  source_tier text,
  annotation_status text,
  annotator_1_label public.annotation_label,
  annotator_2_label public.annotation_label,
  final_label public.annotation_label,
  included_in_binary_dataset boolean,
  binary_complaint_label integer
)
language sql stable security definer set search_path = public as $$
  with resolved as (
    select r.id, r.candidate_id, r.review_text, r.source_tier, r.source_order,
      p.annotator_1_label, p.annotator_2_label,
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
  select candidate_id, review_text, source_tier, annotation_status,
    annotator_1_label, annotator_2_label, final_label,
    final_label in ('complaint', 'not_complaint') as included_in_binary_dataset,
    case final_label
      when 'complaint' then 1
      when 'not_complaint' then 0
      else null
    end as binary_complaint_label
  from resolved
  order by case source_tier when 'TIER_A_CONFIDENT' then 1 when 'TIER_B_LIKELY' then 2 when 'TIER_C_RECHECK' then 3 else 4 end,
    source_order, id;
$$;

revoke all on function public.annotation_pairs() from public;
grant execute on function public.next_disagreement_for_current_user() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.export_final_dataset() to authenticated;
