# TestForge User Guide

A complete walkthrough of everything TestForge can do, written for the people who'll actually use it day to day — QA engineers, test leads, and admins — not for developers modifying the code. For architecture and codebase internals, see [CLAUDE.md](../CLAUDE.md) instead.

If you haven't installed TestForge yet, see [SETUP.md](../SETUP.md) first. Once it's running at `http://localhost:5173`, come back here.

## Table of contents

1. [Core concepts](#core-concepts)
2. [Logging in and roles](#logging-in-and-roles)
3. [Projects](#projects)
4. [Test cases](#test-cases)
5. [Test runs and execution](#test-runs-and-execution)
6. [Test plans](#test-plans)
7. [Milestones](#milestones)
8. [Reports](#reports)
9. [Defects](#defects)
10. [Dashboard and My Tests](#dashboard-and-my-tests)
11. [Activity log](#activity-log)
12. [Webhooks](#webhooks)
13. [REST API and API keys](#rest-api-and-api-keys)
14. [Admin: managing users](#admin-managing-users)
15. [Appearance and printing](#appearance-and-printing)
16. [Keyboard shortcuts reference](#keyboard-shortcuts-reference)

---

## Core concepts

TestForge organizes work in a hierarchy:

```
Project
 └─ Suite
     └─ Section (can nest inside other Sections)
         └─ Test Case
```

A **Test Case** is a reusable piece of test documentation (what to check, expected result). It's not tied to any specific point in time — you write it once and reuse it across many test runs.

A **Test Run** is a snapshot: when you create a run, TestForge copies the current content of every case you include into that run. Editing or deleting the source test case afterward never changes a run that already exists — this is deliberate, so historical results always reflect exactly what was tested at the time, not whatever the case looks like today.

A **Test Plan** groups multiple runs together (e.g., all the runs for one release). A **Milestone** represents a release or deadline and can have plans and runs tied to it, with its own due date.

---

## Logging in and roles

Open `http://localhost:5173`. There's no public self-registration (matching real TestRail) — accounts are created by an admin. If you're using the seeded demo data, four accounts are available:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@testforge.local` | `ChangeMe123!` |
| Lead | `lead@testforge.local` | `LeadPass123!` |
| Tester | `tester@testforge.local` | `TesterPass123!` |
| Viewer | `viewer@testforge.local` | `ViewerPass123!` |

Roles control what you can do, checked on every request (not just hidden in the UI):

- **Admin** — everything, including provisioning users and managing API keys for other people.
- **Lead** — everything except user administration: create/edit/delete projects, suites, sections, cases, runs, plans, milestones, webhooks, configurations; assign work to others.
- **Tester** — can author test cases and submit results, but can't restructure the project (no deleting suites/sections, no managing webhooks).
- **Viewer** — read-only everywhere.

Your session uses a short-lived token that refreshes automatically in the background — you generally won't notice it, but if you're inactive for a very long time you may be asked to log in again.

---

## Projects

The **Projects** page (after login) lists every project you have access to — roles are global, not per-project, so everyone sees every project. Click **Create project** and give it a name and optional description.

Inside a project, the left sidebar is your main navigation: **Overview**, **Test Cases**, **Test Runs & Results**, **Test Plans**, **Milestones**, **Defects**, **Reports**, **Activity**, and (Admin/Lead only) **Webhooks**.

**Overview** is the project's dashboard: stat tiles (suites/cases/runs/milestones/pass rate) and a status bar per recent run.

To rename or delete a project, use the pencil/trash icons on the project card in the Projects list (Admin/Lead only). Deleting a project is permanent and takes its suites and active runs with it — closed runs are preserved. You'll see a confirmation showing exactly what will be destroyed before it happens.

---

## Test cases

### Suites and sections

A **Suite** is a top-level grouping within a project (e.g., "Fund Transfers", "Login"). Inside a suite, **Sections** organize cases into a tree — sections can nest inside other sections. Use **+ Add** in the sidebar to create a section, optionally under a parent.

You can drag a section up or down to reorder it among its siblings (grab the section row itself). You can also drag a test case (using the small grip handle on the left of its row) onto a section in the sidebar to move it there — this is for **moving** a case to a different section, not for reordering cases within the same section (that isn't supported).

Deleting a section or suite is a real cascade delete (matching TestRail): it destroys every case inside it, including nested subsections. You'll see a confirmation with exact counts first. Test cases themselves use a softer two-step delete instead — see [Soft-delete and restore](#soft-delete-and-restore) below.

### Creating a test case

Click **+ New case** inside a section. Every case has a **Template**, which changes what fields you fill in:

- **Test Case (Text)** — a single freeform paragraph of instructions, plus Preconditions and an overall Expected Result. Good for simple checks that don't need numbered steps.
- **Test Case (Steps)** — the classic format: a numbered list of `step | expected result` pairs, plus Preconditions.
- **Exploratory Session** — replaces Steps/Expected with **Mission** (what you're exploring) and **Goals** (what you're trying to learn), for session-based exploratory testing rather than scripted steps.
- **BDD Scenario** — Given/When/Then/And/But lines instead of steps, for behavior-driven cases. These can be exported to and imported from real `.feature` files (see [CSV and .feature import/export](#csv-and-feature-importexport)).

Every case also has **Priority** (Low/Medium/High/Critical), **Type** (Functional/Smoke/Regression/Performance/Security/Usability/Acceptance/Other), an optional **Estimate** (free text, e.g. `10s`, `2m`), and an optional **Reference** field for linking an external requirement/ticket ID.

### Shared Steps

If several cases repeat the same sequence of steps, create a **Shared Step Set** once (via the "Shared Steps" link on the Test Cases page) and attach it to any Steps-template case — it renders as a "Shared: <name>" block after the case's own steps. Editing a shared set updates every case using it immediately. You can also promote a case's existing steps directly into a new shared set with one click.

Shared steps are live-linked on the case itself, but once a **run** is created, the steps are snapshotted like everything else — editing a shared set later never changes a run that already exists.

### Labels

Labels are lightweight project-scoped tags (up to 10 per case) — useful for cutting across the section hierarchy (e.g., tagging cases `@smoke` or `@regression-only`). Manage them via "Manage labels" inside the case Filter dialog. Renaming a label updates every case using it; deleting removes it everywhere.

### Filtering, sorting, and bulk actions

Click **Filter** above the case list to filter by Section, Priority, Type, Created By, Label, or a Created-On date range — combine multiple filters with "Match all" or "Match any". A separate **Sort** control (field + direction) works independently of whether a filter is active.

Select multiple cases with the checkboxes to bulk-edit priority/type/section, bulk-add a label, or bulk-delete — all in one action rather than one at a time.

### Attachments

Any test case can have files attached (drag a file onto the "Attachments" area, or click "+ Attach file"). There's a 10MB size cap per file. Downloads always force a file-save dialog rather than opening in the browser, even for images, as a security precaution.

### History & Context

Click **History** on any case row to see every run it's ever appeared in with its result there, plus a rollup of any defects linked to it across all those runs — useful for answering "has this ever passed?" without hunting through individual runs.

### CSV and .feature import/export

**Export CSV** opens a dialog to pick which sections and which columns to include (leave sections unchecked to export everything). **Import CSV** expects a `title` column at minimum; the section column can be a flat name or a `Parent > Child > Grandchild` hierarchy path, which auto-creates the nested sections if they don't already exist.

**Export .feature** / **Import .feature** round-trip BDD-template cases as real Gherkin `.feature` files — export bundles every BDD case in a suite into one file; import auto-creates a section named after the file's `Feature:` line and creates one case per `Scenario:` block.

### Soft-delete and restore

Deleting a case is reversible by default — check **Show deleted** to see everything that's been soft-deleted, with a **Restore** action (single or bulk). A separate, explicit **permanent delete** action is only reachable once a case is already soft-deleted, as a deliberate second confirmation before data is actually gone for good.

---

## Test runs and execution

### Creating a run

From **Test Runs & Results**, click **+ New run**, pick a suite (every case in it is included by default, or pick specific cases), and optionally assign every test in the run to one person up front.

### Executing tests

Click into a run to see its test list — each row shows priority, title, current status, and who it's assigned to. Click a row to expand it and record a result:

- **Pass & Next** — the fast path: marks the test Passed and automatically scrolls to and expands the next untested test.
- **Failed / Blocked / Retest** — the other three statuses, each with a dedicated button; these don't auto-advance, since a failure usually needs a comment or defect ID recorded before moving on.
- **Comment** and **Defect IDs** — free text; defect IDs that look like a URL render as a clickable link, and the field autocompletes from defect IDs already used elsewhere in the project.
- **Version** and **Elapsed** — an optional build/release string, and either type a number of seconds directly or use the built-in **Start/Stop timer**.
- **Assign to** — reassign the test in the same action as submitting a result, instead of as a separate step.
- If the case uses the **Steps** template, you can additionally set a status and actual-result note per individual step, not just one overall status.

Each test row has a colored left-edge bar matching its current status (green/red/orange/cyan/gray), so you can scan a long list for failing tests without reading every badge.

A run's **History** section on each test shows every past result, including any file attachments on that specific result (separate from attachments on the source case).

### Assignment

Tests can be assigned five different ways, whichever fits the moment: inline per-row, via checkbox-select + "Assign selected", via the **Filter by user** panel paired with "Assign all in filter" (filter the list down, then bulk-assign everything currently shown), at run-creation time, or inline while submitting a result.

### Batch actions

Select multiple tests with the checkboxes to bulk-reassign or bulk-set one status across all of them in a single action.

### Rerun vs. Reopen

**Rerun** creates a *new* run containing only the tests that ended up in whichever statuses you pick (defaults to Failed/Blocked/Retest, matching TestRail's own default) — it never modifies the original run, which is the correct way to "continue testing" after a run is closed. **Reopen** is also available and does modify the original closed run directly — this is a deliberate, non-standard extra option TestForge provides beyond what real TestRail allows; prefer Rerun unless you specifically need to reopen the exact same run.

### Closing a run

**Close run** marks it complete (shows up as "Closed" everywhere, excluded from "active run" scoping like the My Tests page and cross-project dashboard). Closed runs are preserved in full when their parent suite or project is later deleted.

### Keyboard shortcuts

With a test expanded, press **P** to Pass & advance, **F** for Failed, **B** for Blocked, **R** for Retest — ignored while you're typing in a text field. See the [full reference](#keyboard-shortcuts-reference) below.

### Exporting defects and drafting Jira tickets

**Export defects CSV** on a run bulk-exports every Failed/Blocked test as a Jira-bulk-import-shaped CSV. On an individual test, **Draft defect for Jira** auto-generates a title/description (steps, expected/actual, environment, a link back to the test) with a copy-to-clipboard button — this doesn't talk to a real Jira instance, it's a drafting aid.

---

## Test plans

A **Test Plan** groups several runs together — typically one plan per release, with a run for each suite or configuration you're testing. Create one from **Test Plans**, optionally tying it to a Milestone.

**+ Add run to plan** creates a new run inside the plan. If you've set up **Configurations** (project-scoped groups like "Browsers" with named values like "Chrome"/"Firefox"), you can select one or more config values here to create one run per selected value in a single action, rather than creating them one at a time. Manage configurations via the "Manage configurations" link on this same form.

**Rerun plan** reruns every run in the plan independently (same status-filter logic as rerunning a single run) and attaches the new runs back onto the same plan.

---

## Milestones

Milestones represent a release or deadline. They support a **Start date** and **Due date**, can nest under a parent milestone, and move through three lifecycle states automatically based on their dates: **Upcoming** (start date in the future), **Open** (started, not yet complete), and **Completed** (marked done manually). A milestone that hasn't started yet shows a **Start Milestone** button to move it to Open early.

Dates cascade downward: a Plan or Run with no date of its own inherits from its Milestone (shown as "Inherits milestone due date: ..."), and a Plan's Run inherits from the Plan next. You can always override with an explicit date. If you do set an explicit date later than the parent's, you'll see a non-blocking warning — it's allowed, just flagged.

---

## Reports

The **Reports** tab (project sidebar) has four categories, listed in the left-hand picker. Every report is configured live — pick your filters and the report updates immediately; nothing is saved as a named report definition. Every report has a **Download CSV** button for its table, and most also support **Print** (uses your browser's own print-to-PDF, no separate export needed).

### Cases Reports

- **Activity Summary** — cases created or updated in a date range (Today/Yesterday/This Week/This Month/custom, etc.), grouped by day, month, or section.
- **Coverage for References** — what percentage of cases have a Reference set, grouped by which reference they point to; helps spot requirements with no test coverage.
- **Property Distribution** — cases grouped by Priority, Type, Template, or Created By, with counts and percentages.
- **Status Tops** — which cases are failing most (or passing most), based on their latest — or all — results across a set of test runs.

### Defects Reports

- **Summary** — a rollup of every defect ID across a set of runs, with how many are still failing vs. look resolved.
- **Summary for Cases** — a grid: one row per case, one column per run, showing the defect IDs logged in each cell.
- **Summary for References** — the same grid, grouped by requirement reference instead of a flat case list.

### Results Reports

- **Comparison for Cases** — the same case-by-run grid as above, but plain pass/fail status instead of defect focus — good for spotting a case that fails consistently across multiple runs.
- **Comparison for References** — grouped by reference.
- **Property Distribution** — tests grouped by Status, Type, Assigned To, or Template across a set of runs.

### Summary Reports

One shared layout (status breakdown, an activity-over-time chart, a simplified progress estimate, the list of runs in scope, and a test list) applied to four different scopes:

- **Milestone** — pick a milestone; includes every run tied to it directly or through one of its plans.
- **Plan** — pick a plan; includes just that plan's own runs.
- **Project** — the whole project, aggregating every milestone (child milestones aren't rolled into their parent's totals — each is its own row).
- **Runs** — a hand-picked set of runs you check off yourself. Unlike every other report, leaving nothing selected here shows an empty report rather than defaulting to recent runs — this is the one report meant only for a deliberately chosen set.

Clicking a status segment (or its legend entry) on a Summary report's status bar filters the test list below it to that status — click it again to clear the filter.

---

## Defects

TestForge doesn't integrate with a real defect tracker — "defects" are whatever text you type into the Defect IDs field on a result, aggregated after the fact. The project's **Defects** tab rolls up every defect ID ever entered, showing how many cases still reference it, how many currently look resolved, and when it was last seen. A red bug icon appears next to any test row whose latest result is Failed/Blocked with a defect attached, so it's visible without expanding the row.

---

## Dashboard and My Tests

The top-nav **Dashboard** link shows stats and a status bar across *every* project you can see, not just one — useful as a single "how's everything doing" view.

**My Tests** shows everything currently assigned to you in still-open runs, split into **Active** and **Upcoming** (upcoming = the run's effective start date, inherited from its plan or milestone if it has no date of its own, is in the future), grouped by run. Admins and Leads get a dropdown to view another team member's list instead of their own, plus a **Workload** chart showing active-test counts per assignee across the whole app — handy for spotting who's overloaded before assigning more work.

---

## Activity log

Each project has an **Activity** tab showing a chronological feed of specific actions worth a paper trail: label renames/deletes, section/suite/case deletions, milestone/plan/run date changes, and run closures. It's deliberately not a log of every single change — just the ones that are destructive or easy to second-guess later.

---

## Webhooks

Admins and Leads can configure outbound webhooks (project **Webhooks** tab) that POST to a URL you provide when a run is created, a run completes, or a case is created. Each delivery is HMAC-signed (so your receiver can verify it really came from TestForge) and logged with its outcome — use the **test-ping** button to confirm your endpoint is reachable before relying on it.

---

## REST API and API keys

Every feature in the UI is also available over a documented REST API at `/api/v1`, versioned and described with Swagger UI at `http://localhost:4000/api/v1/docs` (raw OpenAPI spec at `/api/v1/openapi.json`).

To call the API from a script or CI job, create a personal API key at **Account → API Keys** (top-right user menu). The raw key is shown exactly once at creation — copy it immediately, TestForge only stores a hash of it afterward. Send it as `Authorization: Bearer <key>` on every request.

---

## Admin: managing users

There's no public sign-up — an Admin provisions every account from **Users** (top nav, Admin only): set a name, email, temporary password, and role. Users can be deactivated without deleting their history (their past results/authorship stay intact).

---

## Appearance and printing

Toggle light/dark mode with the sun/moon icon in the top-right of every page — your preference is remembered across visits, and defaults to your OS setting the first time.

Several pages (the test case list, a run's execution view, a plan's detail page, and Milestones) have a **Print** button. This uses your browser's own print dialog — choose "Save as PDF" there if you want a file rather than a physical printout. The printed/exported view automatically hides navigation, filters, and action buttons, leaving just the actual content.

---

## Keyboard shortcuts reference

| Context | Key | Action |
|---|---|---|
| Run execution, test expanded | `P` | Pass & advance to the next untested test |
| Run execution, test expanded | `F` | Mark Failed (stays on this test) |
| Run execution, test expanded | `B` | Mark Blocked (stays on this test) |
| Run execution, test expanded | `R` | Mark Retest (stays on this test) |
| Any modal | `Esc` | Close the modal |

Shortcuts are ignored while a text field, textarea, or dropdown has focus, so typing "pass" into a comment box never accidentally submits a result.
