-- Stable, complete label history for the annotator's "My labels" page.

create or replace function public.all_annotations_for_current_user()
returns table (
  id bigint,
  candidate_id text,
  review_text text,
  source_tier text,
  label public.annotation_label,
  updated_at timestamptz,
  annotation_number bigint
)
language sql stable security definer set search_path = public as $$
  with numbered as (
    select
      r.id,
      r.candidate_id,
      r.review_text,
      r.source_tier,
      a.label,
      a.updated_at,
      row_number() over (order by a.created_at, r.id) as annotation_number
    from public.annotations a
    join public.reviews r on r.id = a.review_id
    where a.annotator_id = auth.uid()
      and public.current_app_role() = 'annotator'
  )
  select * from numbered order by annotation_number desc;
$$;

grant execute on function public.all_annotations_for_current_user() to authenticated;
