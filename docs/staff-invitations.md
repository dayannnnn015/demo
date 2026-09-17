# Staff invitations and account recovery

Authorizing a colleague used to mean an operator inviting them in the Supabase dashboard, then someone pasting the returned UUID into a form. Nothing recorded who asked for the account, what permission level was intended, or whether a pending request had been fulfilled. This increment adds that record. It does **not** move identity creation into EDUNEXUS.

## Why EDUNEXUS still does not mint identities

Creating an Auth user requires a Supabase service-role key. A key like that in the Vercel runtime could create, alter or delete **any** identity in the project, including principals — a much larger blast radius than the restricted database login the runtime holds today.

That is a deliberate boundary, enforced in two places. [`readConfig`](../src/core/config.ts) rejects a secret or service key outright, and [deployment](deployment.md) keeps the service-role key local to the operator. This increment keeps the boundary and improves the workflow around it. Moving identity creation into the API remains an open decision for the school and the deployment operator, recorded as such in [constraints](constraints.md).

## The workflow

1. **Request.** A manager records the intended email, display name and permission level, with a reason. The invitation is `requested`.
2. **Provision.** The operator creates the Auth identity in Supabase, outside EDUNEXUS, and returns its UUID.
3. **Link.** A manager submits that UUID against the current invitation version. EDUNEXUS creates the `edunexus.staff` row and marks the invitation `provisioned` **in one transaction**, so school access and the invitation record can never disagree.
4. **Cancel.** An outstanding request can be cancelled with a reason instead, leaving the history intact.

Both `provisioned` and `cancelled` are terminal. Correcting a mistake means cancelling and requesting again; the same email may be requested again afterwards.

## Rules

- Emails are normalized to lowercase and trimmed. Validation is deliberately permissive — Supabase, not EDUNEXUS, decides deliverability — but a single address with no whitespace or control characters is required, at both the API and the database.
- One **open** request per email, enforced by a partial unique index. Cancelled and provisioned rows do not occupy that slot.
- One invitation per linked identity, and `edunexus.staff.user_id` is a primary key, so an identity already holding school access cannot be linked again.
- The Auth identity must already exist. A UUID that is not in `auth.users` fails the foreign key and the whole transaction rolls back, leaving no staff row, no status change and no journal entry.
- Permission levels follow the rule already in the `staff_insert` policy: a principal may request any level, an administrative officer only `teacher`. The check runs on request, provision and cancel, because a security-definer function bypasses row policies. `assert_may_grant_role` mirrors that policy and is not runtime-callable.
- Every action requires a reason of 10–500 single-line characters and writes an immutable before/after journal entry with actor and request ID.

## API

| Operation | Contract |
|---|---|
| `GET /api/v1/staff-invitations` | `status=requested\|provisioned\|cancelled\|all` (default requested), `role`, `after_id`, `limit` default 50/max 100. Filters precede pagination. |
| `GET /api/v1/staff-invitations/:id` | One invitation. |
| `POST /api/v1/staff-invitations` | Email, display name, permission level and reason. |
| `POST /api/v1/staff-invitations/:id/provision` | Current version, the provisioned Auth `user_id`, and a reason. |
| `POST /api/v1/staff-invitations/:id/cancellation` | Current version and a reason. |
| `GET /api/v1/staff-invitations/:id/events` | Newest-first history, `limit` default 5/max 10, `before_version`. |

Every operation requires an active manager. A completed or cancelled target returns `INVITATION_STATE` (409); a duplicate open email or an already-authorized identity returns `ALREADY_EXISTS` (409); an unknown Auth identity returns `INVALID_REFERENCE` (409). No endpoint sends mail, and none accepts or returns a credential.

## Personal data

An invitation stores a staff email address, which the rest of the schema does not. It is the minimum needed to tell the operator who to invite, it is manager-only under RLS, and it is never copied into change-audit rows. It is staff contact information for provisioning, not learner data.

## Account recovery

The sign-in page now offers "Email me a recovery link", which calls Supabase's `resetPasswordForEmail` from the browser with the publishable key, exactly as any visitor's client would, and returns to `/account/setup` to set a new password. The API is not involved and holds no credential that could send it.

The reply is identical whether or not the address has an account, so an unauthenticated visitor cannot use the form to discover which addresses are registered.

That sameness has to include the rate limit. Supabase answers 200 for an unknown address but throttles a registered one to a link a minute, so surfacing a throttle as its own message would confirm the account exists. A throttled request therefore gets the same reply as a successful one, and only a project-wide failure such as a disabled Email provider, which behaves identically for every address, is named.

Supabase built-in mail also caps the whole project at a few messages an hour, which will not survive staff onboarding: configure a real SMTP provider first. An operator can issue a single link without mail through the Auth admin generate_link endpoint, which is not rate limited.

Authenticator (MFA) reset is **not** covered. Removing a verified factor for someone who lost their device needs the admin API, so it remains an operator action in Supabase. That, and supervised device enrollment, still need a written operational process with the school.
