# The UI notes of 8 November: plan

**Asked 8 November 2026.** The user passed on eleven notes about the interface and asked for them in at most five increments, planned first and started on their word, with full freedom to decide the vague ones and to fix other inconsistencies found on the way. The notes, as given (Tagalog kept, with what it means):

> 1. Notifications. 2. "Next year's Classes": make it more presentable. 3. Remove "Reason for this entry" from Academic history, section offerings, subject catalog. 4. Loading state. 5. Learner Registry "Include records linked into another". 6. Unnecessary movements when opening an announcement. 7. Staff portal: *"baka pwedeng popout nalang instead of magreredirect to another page"*, could it pop out instead of going to another page? 8. Admission: *"baka pwede lagyan ng indicator (number) kung ilan ung request na need iapprove"*, could it show a number for how many requests wait for approval? 9. Improve the profiles of users and of learners. 10. Put sections in the learner registry, for teachers who hold two classes. 11. Consistent boxes.

**Re-planned the same day against 0.102.2.** The plan was first written in a checkout still at 0.86.1, and U1 was built and deployed there as 0.87.0 over live 0.102.2 before the newer line was found (see [status](status.md)). U1 was then brought onto 0.102.2 as 0.103.0. The notes read against 0.102.2:

| # | Note | On 0.102.2 | What remains |
|---|---|---|---|
| 1 | Notifications | **Done in 0.93.0–0.95.0**: the bell with its unread count, the notification centre and the inbox. | Nothing beyond note 8. |
| 2 | Next year's classes | A long column of tiles and three tables. | Steps (choose, draw, check, enrol), each section as a card with its boys and girls drawn, learners grouped under their new section, *not placed* grouped by why. Counts only. |
| 3 | Reasons | *Reason for this entry* is on **Academic history**'s new-year sheet; Subjects & offerings asked for a reason everywhere. | **Done in 0.103.0** (U-D2). Corrections keep their reason. |
| 4 | Loading | 0.90.1 added *Working…* in the top bar and on buttons. Lists still dropped to a skeleton on every save; *No active school year* showed before the year was read. | **Done in 0.103.0.** |
| 5 | "Include records linked into another" | Unchanged. | **Show duplicate entries**, a hint, and a duplicate's badge naming the record it belongs to. |
| 6 | Announcement movement | 0.95.x opens an announcement as a panel over the list, but the page still cross-faded behind it. | **Done in 0.103.0.** |
| 7 | Staff portal | A link to `/app`. | A sign-in panel over the front page (U-D3). |
| 8 | Admission count | The rail item is **Admissions**; its *Class lists from advisers* card counts waiting lists only once opened. | A number on **Admissions** (and on the other screens where something waits on the viewer), from a read that names nobody. |
| 9 | Profiles | 0.91.1 split the learner into profile, academic history and enrollment; My profile and Settings were split in 0.92.0. | Re-examine both once U2's registry work lands; a colleague's profile from Staff access. |
| 10 | Sections in the registry | Grade and Section columns exist; managers filter by grade. | A **Section** filter, which is what an adviser with two classes needs. |
| 11 | Boxes | One radius per kind of box was not held. | **Done in 0.103.0.** |

## Decisions

U-D1 to U-D5, recorded in [constraints](constraints.md) on 8 November.

## Increments

| | Version | Notes | What |
|---|---|---|---|
| U1 | 0.103.0 | 11, 4, 6, 3 | **Shipped 8 November.** Consistent boxes, loading kept on screen, a still front page, no reason asked when adding a subject, an offering or a historical record. |
| U2 | 0.104.0 | 10, 5, 9 (learners) | **The learner registry.** Section filter; duplicates in plain words; the learner's profile reviewed. |
| U3 | 0.105.0 | 8 | **Counts on the rail.** A number on Admissions and the other approval screens. |
| U4 | 0.106.0 | 9 (users), 7 | **Profiles and the Staff portal.** |
| U5 | 0.107.0 | 2, then all | **Next year's classes, and the test pass.** |
