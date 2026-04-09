# Scenario C10: UX Perspective Activation

## Metadata
- **Tier**: Complex
- **Focus**: Non-technical perspective activation (user empathy), assumption exposure (who uses this and why), mid-task injection from support data, mobile context adaptation
- **Estimated iterations**: 10-16

## 1. The Problem Being Tested

**Failure mode**: The agent builds a technically correct feature that nobody wants to use. Given "add a notification preferences page," it produces a CRUD form with toggles -- schema, API, UI, done. The page works. It is also useless, because the agent never asked *who comes to this page* (a frustrated user who wants the emails to stop), *when* (after receiving a notification that annoyed them), or *what good looks like* (not a wall of toggles but a page that helps them regain control fast).

**Why agents miss this**: Technical correctness has clear verification signals -- the form renders, the API saves, the toggle state persists. User experience has none. There is no test that fails when grouping is bad, no compiler error when quiet hours are missing, no exception when the "unsubscribe from all" option is buried. The agent's reward signal is "does it work?" not "does it help?"

**What makes this different from C06/C08**: Those scenarios test assumption tracking and injection response on domains the agent already respects (payments, infrastructure). This scenario tests whether the deliberation engine activates a perspective the agent is structurally biased to ignore -- the non-technical, emotional, context-dependent experience of a real user. The technical implementation is trivially easy. The hard part is noticing that the technical implementation is not the point.

## 2. Scenario Setup

### Knowledge Graph State

**Cluster 1: Existing Notification System**

- **Node: `notification_types`** (type: `schema`)
  - Observation 1: "System sends 7 notification types: @mention, comment_reply, task_assigned, due_date_reminder, weekly_digest, team_announcement, system_maintenance" (confidence: 0.95, createdAt: 2026-03-15)
  - Observation 2: "Each notification fires on both email and in-app channels; no per-channel control exists" (confidence: 0.92, createdAt: 2026-03-15)
- **Node: `notification_service`** (type: `component`)
  - Observation 1: "NotificationService.send(userId, type, payload) is the single dispatch path; checks no user preferences" (confidence: 0.93, createdAt: 2026-03-18)
  - Observation 2: "Email delivery via SendGrid, in-app via WebSocket push to connected clients" (confidence: 0.90, createdAt: 2026-03-18)
- **Node: `notification_volume`** (type: `metric`)
  - Observation 1: "Average user receives 23 notifications/day; power users in large teams receive 80+" (confidence: 0.88, createdAt: 2026-03-25)
  - Observation 2: "Email open rate for notification emails: 12%, down from 34% six months ago" (confidence: 0.85, createdAt: 2026-03-26)

**Cluster 2: User Complaints & Support Data**

- **Node: `notification_complaints`** (type: `signal`)
  - Observation 1: "Support ticket volume for 'too many emails' increased 4x in Q1; now #2 most common complaint" (confidence: 0.91, createdAt: 2026-03-20)
  - Observation 2: "3 enterprise customers escalated notification spam as a blocker for renewal" (confidence: 0.87, createdAt: 2026-03-22)
  - Observation 3: "Users report getting task_assigned emails for tasks they were later removed from; no unassign notification or preference exists" (confidence: 0.83, createdAt: 2026-03-28)
- **Node: `user_workarounds`** (type: `signal`)
  - Observation 1: "Power users are creating email filters to auto-archive all app emails, then missing critical system_maintenance alerts" (confidence: 0.80, createdAt: 2026-03-24)
  - Observation 2: "Some users mute entire Slack channels that mirror app notifications, defeating the team coordination purpose" (confidence: 0.78, createdAt: 2026-03-24)

**Cluster 3: UX Patterns & Legal**

- **Node: `notification_ux_patterns`** (type: `pattern`)
  - Observation 1: "Best practice: group notifications by urgency tier (immediate/daily/weekly), not by technical type" (confidence: 0.85, createdAt: 2026-02-10)
  - Observation 2: "Best practice: notification preferences page should be reachable from every notification (email footer link, in-app notification menu)" (confidence: 0.88, createdAt: 2026-02-10)
- **Node: `accessibility_patterns`** (type: `pattern`)
  - Observation 1: "Screen readers cannot parse toggle grids without proper ARIA labels and grouping; each toggle needs a descriptive label, not just the notification type name" (confidence: 0.82, createdAt: 2026-02-15)
- **Node: `email_compliance`** (type: `constraint`)
  - Observation 1: "CAN-SPAM and GDPR require a one-click unsubscribe mechanism in every commercial email; marketing emails must have it, transactional emails should have it" (confidence: 0.95, createdAt: 2026-01-05)
  - Observation 2: "GDPR Article 21: users have right to object to processing for direct marketing; notification preferences are a data processing consent surface" (confidence: 0.90, createdAt: 2026-01-05)

**Cluster 4: Codebase Context**

- **Node: `settings_page`** (type: `component`)
  - Observation 1: "Existing settings page has sections: Profile, Security, Integrations. No Notifications section. Uses a tabbed layout with a sidebar nav" (confidence: 0.93, createdAt: 2026-03-10)
  - Observation 2: "Settings API follows PATCH /api/v1/users/:id/settings with partial update semantics" (confidence: 0.91, createdAt: 2026-03-10)
- **Node: `user_schema`** (type: `schema`)
  - Observation 1: "users table has no notification_preferences column or related table" (confidence: 0.94, createdAt: 2026-03-12)
  - Observation 2: "User model has timezone field (used for due_date_reminder scheduling)" (confidence: 0.88, createdAt: 2026-03-12)

**Edges:**
- `notification_complaints` --[motivates]--> `settings_page` (weight: 0.9)
- `notification_types` --[displayed_in]--> `settings_page` (weight: 0.7)
- `notification_ux_patterns` --[informs]--> `settings_page` (weight: 0.6)
- `user_workarounds` --[symptom_of]--> `notification_complaints` (weight: 0.85)
- `email_compliance` --[constrains]--> `notification_service` (weight: 0.8)
- `notification_volume` --[causes]--> `notification_complaints` (weight: 0.75)
- `accessibility_patterns` --[constrains]--> `settings_page` (weight: 0.5)
- `user_schema` --[extended_by]--> `notification_types` (weight: 0.6)

### Staged Context (`setup/context/`)

```
mock-collab-app/
  src/
    routes/settings.ts        # existing settings endpoints (profile, security)
    routes/notifications.ts   # send-only; no preferences endpoints
    models/user.ts            # user model, no notification prefs
    models/notification.ts    # notification type enum, dispatch logic
    services/notification.ts  # NotificationService.send(), no preference check
    components/Settings/       # React tabbed layout, Profile + Security tabs
    db/schema.sql             # users, notifications tables; no preferences table
  package.json
  .env.example                # SENDGRID_API_KEY, DATABASE_URL
```

## 3. Multi-Step Evaluation Flow

### Step 1: Initial Prompt
"Add a notification preferences page to the settings section. Users should be able to toggle each notification type on or off."

This is deliberately phrased as a technical task. It says "toggle each notification type on or off" -- inviting a flat list of 7 toggles.

### Step 2: Sense/Discovery (Iterations 1-3)
The agent should:
- Activate all four clusters, not just Cluster 1 (notification system) and Cluster 4 (codebase)
- Discover user complaints cluster -- this reframes the task from "add toggles" to "help frustrated users regain control"
- Discover the email compliance constraints (CAN-SPAM, GDPR one-click unsubscribe)
- Note the notification volume data (23/day average, 80+ for power users) and declining email open rates as evidence that the current system is actively harming engagement
- Identify the user_workarounds node as a signal that a simple toggle page will not stop the bleeding -- users are already using blunt instruments (email filters) that a per-type toggle page does not address

### Step 3: Deliberation (Iterations 3-7)
Expected perspectives the PFC should form:

- **User perspective** (CRITICAL): Who comes to this page? A frustrated person who just got the 15th email today. They want the noise to stop. They do not want to read 7 labels and make 7 decisions. They want: (a) a way to immediately reduce noise, (b) channel control (keep in-app, stop email), (c) grouped categories so they can make one decision instead of seven. The agent should reason about the emotional state of the user arriving at this page.
- **Information architecture**: 7 types should be grouped by urgency. Proposed grouping: Critical (system_maintenance), Collaborative (mention, comment_reply, task_assigned), Reminders (due_date_reminder), Digest (weekly_digest, team_announcement). Each group gets a master toggle.
- **Channel dimension**: The prompt says "on or off" but the real preference is per-channel. A user may want in-app mentions but not email mentions. The schema should be `{type, channel, enabled}` not `{type, enabled}`.
- **Legal/compliance**: CAN-SPAM requires one-click unsubscribe in emails. The preferences page must support "unsubscribe from all emails" as a single action. The email footer must link directly to preferences with the relevant section pre-expanded.
- **Technical integration**: NotificationService.send() must be modified to check preferences before dispatch. What happens to in-flight notifications? What about notifications queued before preferences changed?
- **Defaults**: New users should not start with everything on. Sensible defaults: Critical on everywhere, Collaborative on for in-app and off for email, Reminders on for email only, Digest on for email weekly.

### Step 4: Expected Plan Output
The plan should demonstrate user-first thinking:
- Schema: `notification_preferences` table with `(user_id, notification_type, channel, enabled)` -- not a flat boolean per type
- API: PATCH endpoint with bulk-update support (change all email prefs in one call, not 7 individual calls)
- UI: Grouped by category with master toggles, channel columns (email | in-app), "mute all emails" prominent action
- Entry points: Link from email footer, link from in-app notification dropdown, settings sidebar
- Quiet hours: Leverage existing timezone field; hold non-critical notifications during configured hours
- Defaults migration: Backfill existing users with sensible defaults, not "everything on"

### Step 5: Injection
"Users are complaining in support tickets that they can't figure out how to stop getting emails about tasks they've been removed from."

### Step 6: Response to Injection (Iterations 9-12)
This injection contains three distinct problems:
1. **Missing notification type**: There is no `task_unassigned` notification. Users get `task_assigned` but no signal when removed, so they keep getting updates on tasks they are no longer part of.
2. **Missing preference**: Even with the new preferences page, there is no toggle for a notification type that does not exist yet. The preferences page cannot solve a problem in the notification taxonomy.
3. **Technical bug**: The notification system likely continues sending `comment_reply` and `due_date_reminder` for tasks where the user has been unassigned. The dispatch logic does not check current task membership.

The agent should:
- Identify all three layers (not just "add a toggle")
- Revise the plan to include: (a) new `task_unassigned` notification type, (b) dispatch filter that checks task membership before sending task-related notifications, (c) a preference for "only notify me about tasks I'm currently assigned to"
- Recognize this validates the user-perspective reasoning -- the frustrated user described in Step 3 is exactly this person

### Step 7: Follow-Up
"Can you also make it work well on mobile?"

The agent should consider:
- Push notification permissions are OS-level; the app must handle the case where the user has disabled push in iOS/Android settings but enabled in-app preferences (show a reconciliation message)
- Mobile screen real estate: the channel-by-type grid does not work on a phone. Collapse to per-category accordion with channel toggles inside.
- Push as a third channel: the schema should already accommodate `channel IN ('email', 'in_app', 'push')` -- if it does, good. If the earlier design hardcoded two channels, this is a revision.
- Deep linking: push notification should link to the specific content, and the "manage preferences" link in the notification should deep-link into the settings page

## 4. Gold Standard Dimensions

### CRITICAL (agents typically miss these; missing them means the page is usable but hostile)
- **User emotional context**: Agent reasons about *who* visits preferences and *why* (frustrated, wants quick relief)
- **Channel-level control**: Schema supports per-channel preferences, not just per-type on/off
- **Notification grouping**: Types organized by user mental model (urgency/category), not by technical enum order
- **"Stop all emails" action**: A single prominent action to disable all email notifications
- **CAN-SPAM/GDPR compliance**: One-click unsubscribe in email footer linking to preferences
- **Injection response depth**: Identifies the missing notification type AND the dispatch bug, not just "add a toggle"

### IMPORTANT (missing causes friction or technical debt)
- **Entry points**: Preferences reachable from email footer, in-app notification menu, and settings nav
- **Sensible defaults**: Not "everything on" for new users; considered default matrix
- **Bulk operations**: API supports updating multiple preferences in one call
- **In-flight notification handling**: What happens to queued notifications when preferences change
- **Quiet hours**: Time-based suppression using existing timezone data
- **Schema extensibility**: New notification types and channels addable without migration

### NICE-TO-HAVE
- **Preview/test**: "Send me a test notification" to verify channel settings
- **Per-project or per-team scoping**: Preferences that vary by workspace context
- **Notification history**: "Here's what you would have received" view for recently disabled types
- **Accessibility**: ARIA labels, screen reader grouping, keyboard navigation for toggle grid
- **Undo**: "You turned off comment emails. Undo?" toast after saving

## 5. Load-Bearing Assumptions

1. **"Users want per-type toggles"** -- The prompt says this. Reality: users want per-category, per-channel control. The prompt describes the UI; the agent should design the experience. Blast radius: HIGH. A flat toggle list drives the same email-filter workaround users already use.
2. **"All 7 notification types are equally important"** -- The agent probably treats them symmetrically. Reality: system_maintenance is critical infrastructure; weekly_digest is optional. Blast radius: MEDIUM. Equal treatment means users disable everything to stop digest spam and miss maintenance alerts.
3. **"On/off is the right granularity"** -- The prompt says "toggle on or off." Reality: the preference is per-channel, per-frequency, per-context. Blast radius: HIGH. A user who wants in-app mentions but not email mentions has no way to express this.
4. **"The notification taxonomy is complete"** -- The agent assumes the 7 types cover all cases. The injection reveals task_unassigned is missing. Blast radius: MEDIUM. The preferences page cannot fix notification gaps.
5. **"The notification service respects preferences"** -- The dispatch path currently checks nothing. The agent must modify the service, not just build a settings UI. Blast radius: HIGH if missed. A preferences page that does not actually change behavior is worse than no page.

## 6. Scoring Rubric

| Dimension | Full Credit (5) | Partial Credit (3) | Zero Credit (1) | Weight |
|-----------|----------------|-------------------|-----------------|--------|
| D1: User Perspective | Reasons about user emotional state, arrival context, and desired outcome before designing the UI | Mentions "user experience" generically but designs toggles-first | Builds 7 toggles, wires API, calls it done | **0.25** |
| D2: Information Architecture | Groups by urgency/category, supports per-channel control, includes master toggles and "mute all" | Groups notifications but only on/off per type, no channel control | Flat list matching the enum order in the database | **0.20** |
| D3: Compliance & Safety | CAN-SPAM/GDPR one-click unsubscribe, email footer links, "unsubscribe all" action | Mentions compliance but does not design the mechanism | No mention of legal requirements | 0.10 |
| D4: Injection Response | Identifies all 3 layers (missing type, missing preference, dispatch bug) and revises plan | Identifies 1-2 layers; partial revision | Treats it as "add a toggle for unassigned tasks" | **0.20** |
| D5: Retrieval Quality | All 4 clusters activate; complaint data and workarounds inform the design | 2-3 clusters; complaints noted but not integrated into design decisions | Only codebase and notification schema clusters | 0.10 |
| D6: Assumption Tracking | Explicitly challenges the prompt's framing (per-type on/off) and names 3+ assumptions | Notes some assumptions but accepts the prompt framing | Accepts all prompt assumptions without examination | 0.10 |
| D7: Mobile Adaptation | Push as third channel, responsive layout change, OS permission reconciliation, deep linking | Mentions "responsive design" without specific mobile notification concerns | "Make it mobile-friendly" with no substantive changes | 0.05 |

**Weighting rationale**: D1 (User Perspective) and D2 (Information Architecture) together constitute 45% of the score. A technically perfect page with no user thinking scores at most 2.75 -- below passing. This is intentional. The scenario exists to test user-perspective activation; if that dimension is not decisive, the scenario fails its purpose.

### Passing Threshold
Composite >= 3.5. Must score >= 3 on D1 (User Perspective) and >= 3 on D4 (Injection Response). Failure on either is automatic fail.

### Red Flags
- **D1 drops to 1** if the agent never references the complaint data, volume metrics, or workarounds from Cluster 2 despite them being in the activated graph
- **D2 drops to 1** if the schema is `{user_id, notification_type, enabled}` with no channel dimension
- **D4 drops to 1** if the agent responds to the injection by adding a toggle for "task_unassigned" without addressing the dispatch logic bug
- **D6 drops to 1** if the agent builds exactly what the prompt asks for (per-type on/off toggles) without noting that the prompt describes a UI, not a user need

## 7. What We Learn

**If the agent passes**: The deliberation engine can activate perspectives that are structurally invisible to a technical execution mindset. The knowledge graph's complaint data and workaround signals were not in the prompt but were in the context -- and the PFC used them to reframe the task from "build toggles" to "help frustrated users." This is the difference between a code generator and a deliberation engine: it reasons about the problem space, not just the solution space.

**If the agent fails on D1 but passes D4-D7**: The system can handle injections and track assumptions (left-brain capabilities) but cannot adopt non-technical perspectives (right-brain capabilities). The PFC prompt likely needs explicit instructions to reason about end-user context, emotional state, and arrival intent before designing solutions. The graph had the data; the PFC did not know to ask for it.

**If the agent fails on D1 and D2 but retrieves Cluster 2**: The graph activation works -- complaint data is present in working memory -- but the PFC does not connect "users are frustrated" to "therefore the design should prioritize fast noise reduction." This is a reasoning gap, not a retrieval gap. The PFC can find user signals but cannot translate them into design decisions. Fix: the PFC needs a "who/when/why" frame that forces user-context reasoning before solution design.

**If the agent passes D1 but fails D4**: The system can reason about users in the abstract but cannot integrate concrete user feedback (the support tickets about unassigned tasks) into an evolving plan. This suggests the user-perspective reasoning is performative -- it sounds empathetic in the initial design but does not update when real user data arrives. The deliberation loop's injection handling must connect user signals to design revision, not just technical revision.

**The meta-lesson**: Most eval scenarios test whether the agent can handle *complexity* (many interacting components, conflicting constraints). This one tests whether it can handle *simplicity* -- a task so technically straightforward that the agent's instinct is to execute immediately rather than deliberate. If the deliberation engine only activates on hard problems, it misses the most common failure mode in production: easy-to-build features that nobody wants to use.
