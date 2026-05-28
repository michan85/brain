# Scenario C10: UX Perspective Activation

## Metadata
- **Tier**: Complex
- **Focus**: Non-technical perspective activation (user empathy), assumption exposure, mid-task injection from support data, mobile context adaptation
- **Estimated iterations**: 10-16

## Problem Being Tested

**Failure mode**: The agent builds a technically correct feature that nobody wants to use. Given "add a notification preferences page," it produces a CRUD form with toggles -- schema, API, UI, done. The page works. It is also useless, because the agent never asked *who comes to this page* (a frustrated user who wants the emails to stop), *when* (after receiving a notification that annoyed them), or *what good looks like* (not a wall of toggles but a page that helps them regain control fast).

**Why agents miss this**: Technical correctness has clear verification signals -- the form renders, the API saves, the toggle state persists. User experience has none. There is no test that fails when grouping is bad, no compiler error when quiet hours are missing, no exception when the "unsubscribe from all" option is buried. The agent's reward signal is "does it work?" not "does it help?"

**What makes this different from C06/C08**: Those scenarios test assumption tracking and injection response on domains the agent already respects (payments, infrastructure). This scenario tests whether the deliberation engine activates a perspective the agent is structurally biased to ignore -- the non-technical, emotional, context-dependent experience of a real user. The technical implementation is trivially easy. The hard part is noticing that the technical implementation is not the point.

### Initial Prompt
"Add a notification preferences page to the settings section. Users should be able to toggle each notification type on or off."

### Follow-up Responses

**Injection -- deliver after the agent produces an initial plan or design:**
- "Users are complaining in support tickets that they can't figure out how to stop getting emails about tasks they've been removed from."

**If the agent asks about existing notification types:**
- "We have 7 types: @mention, comment_reply, task_assigned, due_date_reminder, weekly_digest, team_announcement, and system_maintenance. They all fire on both email and in-app right now."

**If the agent asks about user feedback or complaint data:**
- "Support tickets for 'too many emails' are up 4x this quarter. Three enterprise customers flagged it as a renewal blocker. Power users are creating email filters to auto-archive everything from us, then missing critical maintenance alerts."

**If the agent asks about compliance requirements:**
- "We send emails via SendGrid. We should be CAN-SPAM compliant at minimum. Some of our enterprise customers are in the EU so GDPR applies too."

**If the agent asks about the existing settings page:**
- "It has Profile and Security tabs with a sidebar nav. No Notifications section yet. The API uses PATCH /api/v1/users/:id/settings with partial updates."

**Mobile follow-up -- deliver after the injection has been addressed:**
- "Can you also make it work well on mobile?"

## Expected Behavior

### Sense/Discovery (Iterations 1-3)
The agent should:
- Activate all four graph clusters, not just Cluster 1 (notification system) and Cluster 4 (codebase)
- Discover user complaints cluster -- this reframes the task from "add toggles" to "help frustrated users regain control"
- Discover the email compliance constraints (CAN-SPAM, GDPR one-click unsubscribe)
- Note notification volume data (23/day average, 80+ for power users) and declining email open rates
- Identify user_workarounds as a signal that a simple toggle page will not stop the bleeding

### Deliberation (Iterations 3-7)
Expected perspectives the PFC should form:
- **User perspective** (CRITICAL): Who comes to this page? A frustrated person who just got the 15th email today. They want the noise to stop. They do not want to read 7 labels and make 7 decisions. They want: (a) a way to immediately reduce noise, (b) channel control (keep in-app, stop email), (c) grouped categories so they can make one decision instead of seven.
- **Information architecture**: 7 types should be grouped by urgency. Proposed grouping: Critical (system_maintenance), Collaborative (mention, comment_reply, task_assigned), Reminders (due_date_reminder), Digest (weekly_digest, team_announcement). Each group gets a master toggle.
- **Channel dimension**: The prompt says "on or off" but the real preference is per-channel. A user may want in-app mentions but not email mentions. The schema should be `{type, channel, enabled}` not `{type, enabled}`.
- **Legal/compliance**: CAN-SPAM requires one-click unsubscribe in emails. The preferences page must support "unsubscribe from all emails" as a single action. The email footer must link directly to preferences.
- **Technical integration**: NotificationService.send() must be modified to check preferences before dispatch.
- **Defaults**: New users should not start with everything on. Sensible defaults by category.

### Expected Plan Output
- Schema: `notification_preferences` table with `(user_id, notification_type, channel, enabled)` -- not a flat boolean per type
- API: PATCH endpoint with bulk-update support
- UI: Grouped by category with master toggles, channel columns (email | in-app), "mute all emails" prominent action
- Entry points: Link from email footer, link from in-app notification dropdown, settings sidebar
- Quiet hours: Leverage existing timezone field
- Defaults migration: Backfill existing users with sensible defaults, not "everything on"

### Injection Response (Iterations 9-12)
The injection contains three distinct problems:
1. **Missing notification type**: There is no `task_unassigned` notification. Users get `task_assigned` but no signal when removed.
2. **Missing preference**: Even with the new preferences page, there is no toggle for a notification type that does not exist yet.
3. **Technical bug**: The notification system likely continues sending `comment_reply` and `due_date_reminder` for tasks where the user has been unassigned. The dispatch logic does not check current task membership.

The agent should identify all three layers and revise the plan accordingly.

### Mobile Adaptation
- Push notification as a third channel: schema should accommodate `channel IN ('email', 'in_app', 'push')`
- Mobile screen real estate: collapse channel-by-type grid to per-category accordion with channel toggles inside
- OS-level push permission reconciliation
- Deep linking from push notifications to specific content and preferences

## Grading

### Gold Standard Dimensions

**CRITICAL (agents typically miss these):**
- **User emotional context**: Agent reasons about *who* visits preferences and *why* (frustrated, wants quick relief)
- **Channel-level control**: Schema supports per-channel preferences, not just per-type on/off
- **Notification grouping**: Types organized by user mental model (urgency/category), not by technical enum order
- **"Stop all emails" action**: A single prominent action to disable all email notifications
- **CAN-SPAM/GDPR compliance**: One-click unsubscribe in email footer linking to preferences
- **Injection response depth**: Identifies the missing notification type AND the dispatch bug, not just "add a toggle"

**IMPORTANT (missing causes friction or technical debt):**
- Entry points: Preferences reachable from email footer, in-app notification menu, and settings nav
- Sensible defaults: Not "everything on" for new users
- Bulk operations: API supports updating multiple preferences in one call
- In-flight notification handling: What happens to queued notifications when preferences change
- Quiet hours: Time-based suppression using existing timezone data
- Schema extensibility: New notification types and channels addable without migration

**NICE-TO-HAVE:**
- Preview/test: "Send me a test notification" to verify channel settings
- Per-project or per-team scoping
- Notification history view
- Accessibility: ARIA labels, screen reader grouping, keyboard navigation
- Undo toast after saving

### Load-Bearing Assumptions

1. **"Users want per-type toggles"** -- The prompt says this. Reality: users want per-category, per-channel control. Blast radius: HIGH.
2. **"All 7 notification types are equally important"** -- Reality: system_maintenance is critical; weekly_digest is optional. Blast radius: MEDIUM.
3. **"On/off is the right granularity"** -- Reality: the preference is per-channel, per-frequency, per-context. Blast radius: HIGH.
4. **"The notification taxonomy is complete"** -- The injection reveals task_unassigned is missing. Blast radius: MEDIUM.
5. **"The notification service respects preferences"** -- The dispatch path currently checks nothing. Blast radius: HIGH if missed.

### Scoring Rubric

| Dimension | Full Credit (5) | Partial Credit (3) | Zero Credit (1) | Weight |
|-----------|----------------|-------------------|-----------------|--------|
| D1: User Perspective | Reasons about user emotional state, arrival context, and desired outcome before designing the UI | Mentions "user experience" generically but designs toggles-first | Builds 7 toggles, wires API, calls it done | 0.25 |
| D2: Information Architecture | Groups by urgency/category, supports per-channel control, includes master toggles and "mute all" | Groups notifications but only on/off per type, no channel control | Flat list matching the enum order in the database | 0.20 |
| D3: Compliance & Safety | CAN-SPAM/GDPR one-click unsubscribe, email footer links, "unsubscribe all" action | Mentions compliance but does not design the mechanism | No mention of legal requirements | 0.10 |
| D4: Injection Response | Identifies all 3 layers (missing type, missing preference, dispatch bug) and revises plan | Identifies 1-2 layers; partial revision | Treats it as "add a toggle for unassigned tasks" | 0.20 |
| D5: Retrieval Quality | All 4 clusters activate; complaint data and workarounds inform the design | 2-3 clusters; complaints noted but not integrated into design decisions | Only codebase and notification schema clusters | 0.10 |
| D6: Assumption Tracking | Explicitly challenges the prompt's framing (per-type on/off) and names 3+ assumptions | Notes some assumptions but accepts the prompt framing | Accepts all prompt assumptions without examination | 0.10 |
| D7: Memory Hierarchy | Correctly uses working memory for active design state, stores completed analysis in graph | Some working memory use but key design decisions not persisted | No meaningful use of memory hierarchy | 0.00 |
| D8: Mobile Adaptation | Push as third channel, responsive layout change, OS permission reconciliation, deep linking | Mentions "responsive design" without specific mobile notification concerns | "Make it mobile-friendly" with no substantive changes | 0.05 |

### Dimension Weights
D1: 0.25
D2: 0.20
D3: 0.10
D4: 0.20
D5: 0.10
D6: 0.10
D7: 0.00
D8: 0.05

### Passing Threshold
Composite >= 3.5. Must score >= 3 on D1 (User Perspective) and >= 3 on D4 (Injection Response). Failure on either is automatic fail.

### Red Flags
- D1 drops to 1 if the agent never references complaint data, volume metrics, or workarounds from Cluster 2 despite them being in the activated graph
- D2 drops to 1 if the schema is `{user_id, notification_type, enabled}` with no channel dimension
- D4 drops to 1 if the agent responds to the injection by adding a toggle for "task_unassigned" without addressing the dispatch logic bug
- D6 drops to 1 if the agent builds exactly what the prompt asks for (per-type on/off toggles) without noting that the prompt describes a UI, not a user need

## What We Learn

**If the agent passes**: The deliberation engine can activate perspectives that are structurally invisible to a technical execution mindset. The knowledge graph's complaint data and workaround signals were not in the prompt but were in the context -- and the PFC used them to reframe the task from "build toggles" to "help frustrated users."

**If the agent fails on D1 but passes D4-D7**: The system can handle injections and track assumptions but cannot adopt non-technical perspectives. The PFC prompt likely needs explicit instructions to reason about end-user context before designing solutions.

**If the agent fails on D1 and D2 but retrieves Cluster 2**: The graph activation works but the PFC does not connect "users are frustrated" to "therefore the design should prioritize fast noise reduction." This is a reasoning gap, not a retrieval gap.

**If the agent passes D1 but fails D4**: The system can reason about users in the abstract but cannot integrate concrete user feedback into an evolving plan. The deliberation loop's injection handling must connect user signals to design revision.

**The meta-lesson**: This scenario tests whether the deliberation engine only activates on hard problems or also on technically easy tasks where the hard part is noticing that implementation is not the point.
