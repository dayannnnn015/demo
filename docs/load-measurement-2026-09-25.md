# Local load measurement, 25 September 2026

**Finding: the morning register does not survive the school's own peak.** When the 27 advisers open the daily register at the same moment, more than half are refused with `RETRY_REQUIRED` ("Another change is in progress") before they see a single learner. The cause is one exclusive lock that every attendance read takes. It is a design defect in the database's locking protocol, not in the screens, and the fix needs a new migration, which waits on the user's authorization.

## What was measured

`npm run test:load` (`scripts/load-test.ts`) runs the real API in-process against a real PostgreSQL 17 server in a throwaway Docker container. It is seeded like the school: 27 sections of 35 synthetic learners, 945 enrolments, each section with its own adviser, and three configured classroom days. All 27 advisers then do what they do at 7:30 on a school morning, at the same instant: read the register, preview their marks, confirm them. The same is repeated for the afternoon session and the next morning, then for five absence-monitor reads each.

This is a **local** measurement. There is no network between the API and the database, the connection pool is one process's (30 connections) rather than Vercel's and Supabase's, and authentication is the test verifier rather than Supabase JWTs. It establishes whether the database design holds under the school's contention. It does not replace the hosted acceptance run, which the *load and recovery verification* gate still requires.

## Results

27 advisers at once, one run (every run so far has looked the same):

| Wave | Step | Requests | Refused | p50 ms | p95 ms |
|---|---|---|---|---|---|
| Morning register | read register | 27 | 17 | 3272 | 3324 |
| | preview marks | 10 | 0 | 1577 | 2890 |
| | confirm marks | 10 | 0 | 547 | 674 |
| Afternoon, same date | read register | 27 | 16 | 3043 | 3086 |
| Next morning | read register | 27 | 11 | 3682 | 4184 |
| Monitor, 5 reads each | monitor window | 135 | 77 | 2994 | 3152 |

Every refusal is `RETRY_REQUIRED`, and the refused requests all wait almost exactly the three-second `lock_timeout` the API sets on every transaction. Only 1,085 of the 1,890 mark rows the three waves should have produced were written.

The same harness with fewer advisers shows how the latency builds up:

| Advisers at once | read register p50 / p95 ms | refused |
|---|---|---|
| 1 | 110 / 110 | 0 |
| 10 | 962 / 1670 | 0 |
| 27 | 3272 / 3324 | 17 of 27 |

Latency grows linearly with the number of advisers, which is what a queue looks like. One read takes about 110 ms. Twenty-seven of them in a row take about three seconds, and that is where the lock timeout begins refusing them.

## Cause

`edunexus.attendance_context` (migration `0011`) opens with `perform pg_advisory_xact_lock(82412001)`. That is the **exclusive** school-wide academic lock every writer takes. The context is called by `read_daily_attendance`, `preview_daily_attendance`, `commit_daily_attendance`, the monitor (`0013`) and the follow-up evidence helper (`0014`). So every register read in the school, for any section, waits for every other one, and holds the lock until its transaction commits.

The lock is there for a good reason. A read runs several statements, and holding it means no writer can change the sheet between them, so the version, the marks and the schedule a register shows were all true at the same moment. But two *reads* cannot disturb each other, and an exclusive lock makes them queue anyway.

## Proposed fix (not applied — needs authorization)

A new migration, `0023`, that uses `create or replace` on `attendance_context` and the functions above so that:

- **Reads take the lock in shared mode** (`pg_advisory_xact_lock_shared(82412001)`). Readers then run alongside each other, and still never alongside a writer, because every writer keeps the exclusive lock. A register is still read in one consistent state.
- **Writers take the exclusive lock before they call the context.** A transaction holding the exclusive lock may take the shared one again without conflict, but a transaction that took the shared lock first and then asked for the exclusive one could deadlock against another doing the same. So the order is fixed: exclusive first, in every writer.

Proof would be `npm run test:load` answering with no refusals at 27 advisers, plus a case in `tests/concurrency.pg.test.ts` showing that a reader never sees a half-applied write and that two writers still queue.

Two alternatives were considered and are not recommended. Raising `lock_timeout` only moves the failure further out: the 27th adviser would still wait about three seconds, and a larger school or a slower network would bring the refusals back. Accepting the retries leaves the busiest moment of the school day failing for half the advisers.

## Not measured

- **Hosted behaviour.** Network latency between Vercel and Supabase lengthens every transaction that holds the lock, so this is likely to be worse when hosted, not better.
- **Mixed traffic**, such as a manager submitting a month or correcting a timeline during the morning register. Those take the same exclusive lock and would add to the queue.
- **Backup restoration, privilege revocation and rollback drills**, which need operator access to the hosted project.
