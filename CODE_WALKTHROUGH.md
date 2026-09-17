# Code Walkthrough

This guide explains the project in the order that is easiest to learn. You do
not need to understand every file before making a small change.

## 1. The mental model

The application has three layers:

1. **Pages** choose which workspace appears at a URL.
2. **Components** show information and respond to clicks or keyboard shortcuts.
3. **Data functions** read and write information in Supabase.

The database is a separate fourth layer. Its tables, access rules, and reusable
SQL functions are defined in `supabase/migrations`.

## 2. Follow one annotation through the code

Start at `src/app/page.tsx`. The home page renders `AnnotationWorkspace`.

Open `src/components/annotation-workspace.tsx` next. This component:

- loads the current review and progress;
- stores temporary screen state with React hooks;
- maps buttons and keyboard shortcuts to one of the three labels;
- calls `saveAnnotationAndGetNext` after a label is chosen; and
- replaces the current review with the next review returned by the database.

Then open `src/lib/data.ts`. Its functions are the boundary between the user
interface and Supabase. Keeping database calls in one file means a component can
say “save this annotation” without needing to know the SQL details.

Finally, search the migration files for `submit_annotation_and_next`. That SQL
function saves a label and returns the next available review as one operation.
Doing both together avoids an extra round trip and makes rapid annotation more
reliable.

## 3. Demo mode versus real mode

`src/lib/supabase/client.ts` checks for two public environment variables. When
they exist, the app connects to Supabase. When they do not, it returns `null`.

Components use that result to choose between:

- **real mode**, which loads private data through `src/lib/data.ts`; and
- **demo mode**, which uses the harmless examples in `src/lib/demo-data.ts`.

This is why the public code can be previewed without exposing research data or
login credentials.

## 4. Files worth learning first

Read these in order:

1. `src/lib/types.ts` — the vocabulary of the application.
2. `src/app/page.tsx` — the smallest route.
3. `src/components/annotation-workspace.tsx` — the main user flow.
4. `src/lib/data.ts` — communication with Supabase.
5. `supabase/migrations/001_initial_schema.sql` — the initial database design.
6. Later migrations — one feature added at a time.

Leave `src/app/globals.css` until later. It controls appearance but is not the
best place to learn the workflow.

## 5. Common patterns in this project

### `async` and `await`

Database work takes time. An `async` function can pause at `await` without
freezing the page, then continue when Supabase responds.

### React state

Values created with `useState` belong to the current screen. Updating them asks
React to redraw the parts of the interface that changed.

### TypeScript types

Types such as `Review` and `AnnotationLabel` describe allowed values. For
example, `AnnotationLabel` prevents a misspelled label from silently entering
the workflow.

### Supabase RPC

`supabase.rpc("function_name")` calls a PostgreSQL function defined in a
migration. The complicated data rule stays close to the database instead of
being duplicated across screens.

## 6. A safe way to make changes

For each change:

1. Describe the behavior in one sentence.
2. Find the page or component responsible for that behavior.
3. Change one small thing.
4. Run `pnpm lint` and `pnpm build`.
5. Test both demo mode and the relevant signed-in role.
6. Commit with a message that explains the result, not just “update.”

Never test with the only copy of the research dataset. Export a backup first.

## 7. Small practice tasks

These are low-risk ways to become comfortable with the code:

- Change explanatory text in `annotation-guide.tsx`.
- Add one clearly fake record to `demo-data.ts`.
- Trace where the `complaint` label appears without changing it.
- Change a visual spacing value in `globals.css` and inspect the result.
- Add a new field to a TypeScript type on a temporary branch and observe which
  files TypeScript asks you to update.

The goal is not to memorize the stack. It is to understand how a user action
moves through the page, component, data function, and database.
