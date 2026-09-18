import type { AdminOverview, AnnotationLabel, Disagreement, DiscussionMessage, DiscussionReview, FinalDatasetRow, Profile, Progress, RecentAnnotation, Review, WorkflowStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const rpcPageSize = 1000;

type PagedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function collectRpcPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += rpcPageSize) {
    const { data, error } = await fetchPage(from, from + rpcPageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < rpcPageSize) return rows;
  }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("id, display_name, role").eq("id", user.id).single();
  if (error) throw error;
  return data as Profile;
}

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const supabase = createClient();
  if (supabase) await supabase.auth.signOut();
}

export async function getNextReview(): Promise<Review | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("next_review_for_current_user");
  if (error) throw error;
  return (data?.[0] as Review | undefined) ?? null;
}

export async function getProgress(): Promise<Progress> {
  const supabase = createClient();
  if (!supabase) return { total: 3566, completed: 481, skipped: 0 };
  const { data, error } = await supabase.rpc("annotation_progress");
  if (error) throw error;
  return (data?.[0] as Progress | undefined) ?? { total: 0, completed: 0, skipped: 0 };
}

export async function getRecentAnnotations(limit = 12): Promise<RecentAnnotation[]> {
  const supabase = createClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("recent_annotations_for_current_user", { limit_count: limit });
  if (error) throw error;
  return (data ?? []) as RecentAnnotation[];
}

export async function getAllAnnotations(): Promise<RecentAnnotation[]> {
  const supabase = createClient();
  if (!supabase) return [];
  return collectRpcPages<RecentAnnotation>((from, to) =>
    supabase.rpc("all_annotations_for_current_user").range(from, to)
  );
}

export async function getWorkflowStatus(): Promise<WorkflowStatus> {
  const supabase = createClient();
  if (!supabase) return { total_reviews: 3566, double_annotated: 3566, annotation_complete: true, annotations_locked: false };
  const { data, error } = await supabase.rpc("annotation_workflow_status");
  if (error) {
    // Keep the current site usable until migration 007 is installed.
    if (error.code === "PGRST202" || error.code === "42883") {
      return { total_reviews: 0, double_annotated: 0, annotation_complete: false, annotations_locked: false };
    }
    throw error;
  }
  return data as WorkflowStatus;
}

export async function saveAnnotation(reviewId: number, label: AnnotationLabel) {
  const supabase = createClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired.");
  const { error } = await supabase.from("annotations").upsert({
    review_id: reviewId,
    annotator_id: user.id,
    label,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  await supabase.from("review_skips").delete().eq("review_id", reviewId).eq("annotator_id", user.id);
}

export async function saveAnnotationAndGetNext(reviewId: number, label: AnnotationLabel): Promise<Review | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("submit_annotation_and_next", {
    target_review_id: reviewId,
    target_label: label,
  });
  if (!error) return (data?.[0] as Review | undefined) ?? null;

  // Keep deployments safe while the new database migration is being installed.
  if (error.code === "PGRST202" || error.code === "42883") {
    await saveAnnotation(reviewId, label);
    return getNextReview();
  }
  throw error;
}

export async function undoAnnotation(reviewId: number) {
  const supabase = createClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired.");
  const { error } = await supabase.from("annotations").delete().eq("review_id", reviewId).eq("annotator_id", user.id);
  if (error) throw error;
}

export async function skipReview(reviewId: number) {
  const supabase = createClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired.");
  const { error } = await supabase.from("review_skips").upsert({ review_id: reviewId, annotator_id: user.id, skipped_at: new Date().toISOString() });
  if (error) throw error;
}

export async function skipReviewAndGetNext(reviewId: number): Promise<Review | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("skip_review_and_next", { target_review_id: reviewId });
  if (!error) return (data?.[0] as Review | undefined) ?? null;

  if (error.code === "PGRST202" || error.code === "42883") {
    await skipReview(reviewId);
    return getNextReview();
  }
  throw error;
}

export async function getNextDisagreement(): Promise<Disagreement | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("next_disagreement_for_current_user");
  if (error) throw error;
  return (data?.[0] as Disagreement | undefined) ?? null;
}

export async function saveAdjudication(reviewId: number, label: AnnotationLabel) {
  const supabase = createClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired.");
  const { error } = await supabase.from("adjudications").upsert({
    review_id: reviewId,
    adjudicator_id: user.id,
    final_label: label,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  return data as AdminOverview;
}

export async function importReviewBatch(rows: Array<{ candidate_id: string; review_text: string; source_tier: string; source_order: number }>) {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from("reviews").upsert(rows.slice(index, index + 500), { onConflict: "candidate_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function getFinalDataset(): Promise<FinalDatasetRow[]> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return collectRpcPages<FinalDatasetRow>((from, to) =>
    supabase.rpc("export_final_dataset").range(from, to)
  );
}

export async function getDiscussionReviews(): Promise<DiscussionReview[]> {
  const supabase = createClient();
  if (!supabase) return [];
  return collectRpcPages<DiscussionReview>((from, to) =>
    supabase.rpc("discussion_reviews_for_current_user").range(from, to)
  );
}

export async function getDiscussionMessages(reviewId: number): Promise<DiscussionMessage[]> {
  const supabase = createClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("discussion_messages_for_review", { target_review_id: reviewId });
  if (error) throw error;
  return (data ?? []) as DiscussionMessage[];
}

export async function postDiscussionMessage(reviewId: number, message: string): Promise<DiscussionMessage> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.rpc("post_review_discussion_message", {
    target_review_id: reviewId,
    target_message: message,
  });
  if (error) throw error;
  const posted = data?.[0] as DiscussionMessage | undefined;
  if (!posted) throw new Error("The message could not be saved.");
  return posted;
}
