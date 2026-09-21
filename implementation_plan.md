# Goal Description

Develop a fully dynamic "BINS Operator Scoring & Tier Update Engine" to automatically evaluate operator performance and update their Tiers. This ecosystem will empower the Priority Dispatch logic, enabling active and high-performing operators (like Tier 4 Premier) to get early access to high-value jobs.

The current implementation will be built on Node.js/Mongoose and fully dynamically configured from the database without hardcoded thresholds or weights.

## User Review Required

> [!IMPORTANT]
> The Priority Dispatch System requires staggering notifications by seconds (T4 immediately, T3 after 45s, T2 after 90s, etc.). `node-cron` is not ideal for this type of precise, sub-minute delayed execution per order. Since `ioredis` is already in the project, I propose adding `bullmq` as our background job queue to scalably handle these delayed notifications. Please confirm if installing `bullmq` is acceptable.

## Proposed Changes

---

### Core Data Models (Phase 1)

#### [NEW] `src/models/SystemSettings.js`
A global configuration model for admins to define scoring weights without touching code.
- Fields:
  - `scoringWeights`: Objects for `reliability` (0.40), `performance` (0.30), `activity` (0.20), `efficiency` (0.10).
  - `cancellationWeight`: Penalty multiplier for cancellations.
  - `tierThresholds`: The min/max scores for Tier 1 to Tier 4.

#### [NEW] `src/models/JobEvent.js` (Operator Activity Logs)
An event log collection to capture specific operator events. Time-series data makes performance calculation fast and scalable without scanning the entire `Order` history.
- Fields:
  - `operatorId` (Ref: User)
  - `orderId` (Ref: Order, optional)
  - `eventType`: Event kinds like `NOTIFICATION_RECEIVED`, `JOB_ACCEPTED`, `JOB_COMPLETED`, `JOB_CANCELLED`.
  - `responseTimeMs`: Number of milliseconds it took the operator to respond.
  - `revenueGenerated`: Amount of revenue (for `JOB_COMPLETED`).

---

### Scoring Engine Logic (Phase 2)

#### [NEW] `src/modules/scoring/scoreEngine.js`
Create a centralized scoring service with a single static function: `calculateOperatorScore(operatorId)`.

**Mathematical Logic**:
1. Fetch latest System Defaults from `SystemSettings`.
2. Fetch Operator `JobEvent` aggregates via MongoDB Aggregation Pipeline (`$group`, `$avg`, etc.) to find:
   - Acceptance Rate = (Accepted Jobs / Notified Jobs)
   - Reliability = Acceptance Rate - (Cancellation Rate * `cancellationWeight`)
   - Performance = `avgRating` & `onTimeDeliveryRate`
   - Efficiency = Average `responseTimeMs` map to an inverse score out of 100
   - Activity = Normalized total revenue & complete jobs
3. Apply dynamically retrieved weights.
4. Update User `operatorStats.score`.

**Automatic Tier Migration**:
Immediately after calculating the `score` (0-100), compare it against the `SystemSettings` tier thresholds to auto-update the operator's `tier`. It will be wrapped in a **Mongoose Transaction** ensuring both Score and Tier are atomically updated.

---

### Trigger Mechanisms

Instead of a heavy cron job that periodically checks thousands of operators, we will use an **Event-Driven trigger mechanism**.

#### [MODIFY] `src/modules/order/service.js`
- **When to Trigger**: We will hook into the job lifecycle.
  - When an order transitions to `completed`: Trigger a score recalculation.
  - When an order transitions to `cancelled`: Trigger a recalculation (to apply penalty).
  - When dispatch sends a notification and operator accepts: Log a `JobEvent` and optionally recalculate efficiency.

---

### Priority Dispatch & Business Logic (Phase 3 Prep)

#### [MODIFY] `src/modules/order/service.js`
To support staggered dispatch (`T4 first, T3 after 45s, etc.`), we will rewrite the job notification logic to queue dispatches.
- Fetch available nearby operators and categorize them by Tiers.
- Instantly push to T4.
- Queue jobs (using `bullmq` or built-in `setTimeout` logic for MVP) to push to T3 after 45s if order is still `pending`.

## Open Questions

1. **Job Queues**: Can we install `bullmq` for handling the 45-second delayed job dispatches securely, or would you prefer a simple `setTimeout` based in-memory approach?
2. **Reorder System**: For the "Reorder" exclusive 5-minute window, should we simply put the order in a 'locked' pending state for 5 minutes and then automatically release it to the Priority Dispatch queue if unaccepted?

## Verification Plan

### Automated Tests
- N/A - Manual verification of the database settings and operator score changes.

### Manual Verification
- Seed `SystemSettings` into the MongoDB.
- Update an Order status to trigger `calculateOperatorScore`.
- Verify the Operator (`User` model) has a newly updated `operatorStats.score` and `operatorStats.tier`.
