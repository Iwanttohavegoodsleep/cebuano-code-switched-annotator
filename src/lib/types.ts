export type AppRole = "annotator" | "adjudicator" | "admin";

export type AnnotationLabel = "complaint" | "not_complaint" | "not_cebuano_english";

export type Profile = {
  id: string;
  display_name: string;
  role: AppRole;
};

export type Review = {
  id: number;
  candidate_id: string;
  review_text: string;
  source_tier: string;
};

export type Progress = {
  total: number;
  completed: number;
  skipped: number;
};

export type RecentAnnotation = Review & {
  label: AnnotationLabel;
  updated_at: string;
  annotation_number?: number;
  discussion_ready?: boolean;
};

export type Disagreement = Review & {
  annotator_1_label: AnnotationLabel;
  annotator_2_label: AnnotationLabel;
};

export type DiscussionReview = Disagreement & {
  message_count: number;
  last_message_at: string | null;
};

export type DiscussionMessage = {
  id: number;
  review_id: number;
  author_id: string;
  author_name: string;
  author_role: AppRole;
  message: string;
  created_at: string;
};

export type AnnotatorProgress = {
  id: string;
  name: string;
  completed: number;
};

export type AdminOverview = {
  total_reviews: number;
  double_annotated: number;
  pending_disagreements: number;
  adjudicated: number;
  annotation_kappa: number | null;
  annotation_agreement_percent: number | null;
  annotators: AnnotatorProgress[];
};
