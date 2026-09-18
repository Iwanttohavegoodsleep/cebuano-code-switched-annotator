# Put the annotation website online

This setup uses the free plans of Supabase and Vercel. Do not upload the candidate CSV files to GitHub; import them through the private admin dashboard after deployment.

## 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Open `supabase/migrations/001_initial_schema.sql` from this project, copy the whole file, and run it in the SQL Editor.
4. Then open `supabase/migrations/002_three_label_annotation.sql`, copy the whole file, and run it. This adds the final three-label workflow and the single nominal Cohen's kappa.
5. Run `supabase/migrations/003_recent_annotation_history.sql`. This enables the private recent-labels panel for each annotator.
6. Run `supabase/migrations/004_full_annotation_history.sql`. This enables the complete **My labels** page and stable review numbering.
7. Run `supabase/migrations/005_fast_annotation_flow.sql`. This makes label and skip actions transactional and faster.
8. Run `supabase/migrations/006_review_discussions.sql`. This enables the private discussion workspace after both primary labels exist.
9. Run `supabase/migrations/007_data_integrity_and_complete_exports.sql`. This stabilizes annotator identities in Cohen's kappa, locks primary labels after adjudication begins, and makes the final export auditable.
10. Open **Authentication → Users** and create four users:
   - Annotator 1
   - Annotator 2
   - Adjudicator
   - Admin
8. In the SQL Editor, assign the roles using the users' email addresses:

```sql
update public.profiles p
set role = 'adjudicator'
from auth.users u
where p.id = u.id and u.email = 'THIRD_PERSON_EMAIL';

update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL';
```

The other two accounts stay as `annotator` automatically. You may change the names shown in the header:

```sql
update public.profiles p
set display_name = case u.email
  when 'ANNOTATOR_1_EMAIL' then 'Annotator 1'
  when 'ANNOTATOR_2_EMAIL' then 'Annotator 2'
  when 'THIRD_PERSON_EMAIL' then 'Adjudicator'
  when 'YOUR_ADMIN_EMAIL' then 'Research Admin'
end
from auth.users u
where p.id = u.id;
```

## 2. Get the two Supabase keys

In Supabase, open **Project Settings → API**. Copy:

- Project URL
- Publishable key

The publishable key is designed for the website. Privacy is enforced by the database rules in the migration.

## 3. Deploy with Vercel

1. Put this project in a private GitHub repository.
2. Sign in at [vercel.com](https://vercel.com), choose **Add New → Project**, and import that repository.
3. Set the **Root Directory** to `annotation-app` if the repository contains the parent thesis folder.
4. Add these environment variables in Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

5. Choose **Deploy**.

## 4. Import the candidate reviews

1. Sign in to the deployed website with the Admin account.
2. In **Data**, import `tier_a_confident.csv` first.
3. The dashboard should show 3,566 candidate reviews.
4. Keep Tier B and Tier C separate until the study team decides whether they should be included.

The importer reads the existing `candidate_id`, `text`, `confidence_tier`, and `source_row_index` columns. Re-importing a file will not duplicate candidate IDs.

## 5. Start annotation

- Give each person only their own login.
- The two annotators cannot see each other's labels or agreement statistics.
- The annotators choose Complaint, Not complaint, or Not Cebuano-English.
- The adjudicator queue opens only after both annotators finish the entire fixed candidate set.
- As soon as the first adjudication is saved, both original label sets become read-only.
- Skips are private and do not enter the adjudication queue.
- Use the Admin account to monitor progress, view the single three-label Cohen's kappa, and export the complete final CSV. The website verifies that all active reviews are present before downloading it.
- Rows finalized as Not Cebuano-English remain in the audit export but are marked as excluded from the binary model dataset.

## Keyboard shortcuts

The starting shortcuts are `Y` for Complaint, `N` for Not complaint, `L` for Not Cebuano-English, `S` for Skip, `Z` for Undo, and `H` for History. Each annotator can change these with the **Shortcuts** button. The choices are saved on that device.

Press `?` to open the quick annotation guidelines.

## Before the first real annotation session

1. Sign in once with each account and confirm it opens the correct page.
2. Import Tier A and verify that the dashboard shows **3,566** candidates.
3. Annotate a small pilot batch and test one agreement and one disagreement.
4. Confirm that the disagreement appears only in the adjudicator account.
5. Export the audit CSV from the Admin account and store it as a backup.
