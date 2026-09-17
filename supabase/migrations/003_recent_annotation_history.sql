-- Let each annotator review and correct their own most recent labels.

create or replace function public.recent_annotations_for_current_user(limit_count integer default 12)
returns table (
  id bigint,
  candidate_id text,
  review_text text,
  source_tier text,
  label public.annotation_label,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.candidate_id, r.review_text, r.source_tier, a.label, a.updated_at
  from public.annotations a
  join public.reviews r on r.id = a.review_id
  where a.annotator_id = auth.uid()
    and public.current_app_role() = 'annotator'
  order by a.updated_at desc, r.id desc
  limit greatest(1, least(coalesce(limit_count, 12), 50));
$$;

grant execute on function public.recent_annotations_for_current_user(integer) to authenticated;
