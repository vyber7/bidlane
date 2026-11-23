# GitHub issue tracker

Issues and specs live in GitHub Issues for `vyber7/bidlane`. Run `gh` from the repository root and use `--repo vyber7/bidlane` when the checkout could resolve to a different repository.

## Issue operations

- Publish a ticket or spec with `gh issue create --title "<title>" --body-file <path>`.
- Fetch a ticket with `gh issue view <number> --json number,title,body,labels,comments,state`.
- List open tickets with `gh issue list --state open --json number,title,body,labels,comments,assignees`. Add `--label` as needed.
- Create a child issue with `gh issue create --parent <parent>`. Link an existing issue with `gh issue edit <parent> --add-sub-issue <child>`. If sub-issues are unavailable, record `Part of #<parent>` in the child and add it to the parent's task list.
- Record dependencies with `gh issue create --blocked-by <number>` or `gh issue edit <child> --add-blocked-by <blocker>`. If native dependencies are unavailable, record `Blocked by: #<number>` in the issue body. An issue is ready to start when every blocker is closed.
- Comment with `gh issue comment <number> --body-file <path>`.
- Manage labels with `gh issue edit <number> --add-label "<label>"` or `--remove-label "<label>"`.
- To close an issue, post the resolution first and then run `gh issue close <number>`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

- Use a `wayfinder:map` issue to hold Notes, Decisions-so-far, and Fog. Link tickets as child issues and use the appropriate `wayfinder:<type>` label (`research`, `prototype`, `grilling`, or `task`).
- In map order, select the first open, unassigned child with all blockers closed. Inspect native blockers with `gh issue view <number> --json blockedBy`. Read any `Blocked by` references when the map uses the text fallback.
- Claim the ticket with `gh issue edit <number> --add-assignee @me`. Resolve it by posting the answer, closing the ticket, and adding a short summary and link to Decisions-so-far on the map.
