import type { AdminOverview, Disagreement, RecentAnnotation, Review } from "@/lib/types";

export const demoReviews: Review[] = [
  { id: 1, candidate_id: "DEMO-001", source_tier: "DEMO_A", review_text: "Lami ang meal and friendly ang rider." },
  { id: 2, candidate_id: "DEMO-002", source_tier: "DEMO_B", review_text: "Dugay ang delivery, but complete ra ang order." },
  { id: 3, candidate_id: "DEMO-003", source_tier: "DEMO_A", review_text: "I ordered two drinks pero usa ra ang niabot." },
  { id: 4, candidate_id: "DEMO-004", source_tier: "DEMO_B", review_text: "The meal arrived on time and init pa." },
  { id: 5, candidate_id: "DEMO-005", source_tier: "DEMO_A", review_text: "Fresh ang food and maayo ang packaging." },
];

export const demoRecentAnnotations: RecentAnnotation[] = [
  { ...demoReviews[4], label: "not_complaint", updated_at: "2026-09-18T14:07:00.000Z" },
  { ...demoReviews[3], label: "not_cebuano_english", updated_at: "2026-09-18T14:06:00.000Z" },
  { ...demoReviews[2], label: "complaint", updated_at: "2026-09-18T14:05:00.000Z" },
];

export const demoDisagreements: Disagreement[] = [
  {
    id: 8,
    candidate_id: "DEMO-008",
    source_tier: "DEMO_A",
    review_text: "Food was good pero kulang ang order and late kaayo niabot.",
    annotator_1_label: "complaint",
    annotator_2_label: "not_complaint",
  },
  {
    id: 9,
    candidate_id: "DEMO-009",
    source_tier: "DEMO_B",
    review_text: "Super lami ang pancit 😍",
    annotator_1_label: "not_complaint",
    annotator_2_label: "not_cebuano_english",
  },
];

export const demoOverview: AdminOverview = {
  total_reviews: 3566,
  double_annotated: 1280,
  pending_disagreements: 96,
  adjudicated: 41,
  annotation_kappa: 0.76,
  annotation_agreement_percent: 89.7,
  annotators: [
    { id: "a1", name: "Annotator 1", completed: 1394 },
    { id: "a2", name: "Annotator 2", completed: 1280 },
  ],
};
