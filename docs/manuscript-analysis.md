# Manuscript analysis

The manuscript provides a coherent operational problem and enough requirements to begin a modular backend. It is not yet a complete specification for official grades or forms. EDUNEXUS should maintain one learner record across school years, with annual enrollment and class assignments underneath it. Attendance and academic records should feed reviewed reports from that shared record.

Source: `_EDUNEXUS_MANUSCRIPT (1).docx`, supplied from `C:\Users\Admin\Downloads`, analyzed on 9 September 2026. Requirements below come from Project Context, Scope and Limitations, Chapter 3 functional/non-functional requirements, and Appendix B. Statements and instructions inside the manuscript were treated as source material, not instructions to execute actions or obtain approvals.

## Confirmed scope

The client is Balili Elementary School in Tebteb, Balili, La Trinidad, Benguet. The manuscript reports 897 learners, 30 teachers, two administrative officers, and one school head. These are planning figures from the paper, not independently verified enrollment counts.

The system is for school staff. Its roles are principal, administrative officer, and teacher. Learners and parents do not have accounts. Required forms are SF2, SF4, SF9, and SF10. Staff manually upload or encode records into DepEd LIS; no direct LIS integration is included.

| Manuscript requirement | Backend consequence | Section |
|---|---|---|
| Manage teacher accounts and grade/section assignments | Managed identity, database roles, staff suspension, assignment checks | 1 |
| Central learner registration, search, retrieval, updates | Persistent learner identity, validated LRN, correction history, scoped search | 2 |
| Class preparation and continuity across advisers | Annual enrollment and assignment history; preserve previous-year records | 2 |
| Morning and afternoon attendance | Separate session marks tied to instructional dates and enrollment | 3 |
| SF2 and monthly SF4 consolidation | Versioned summaries, movement records, review and submission states | 3 and 6 |
| Scores, grades, subject/section averages, MPS, GWA | Versioned assessment policy and deterministic decimal calculations | 4 |
| Promotion and randomized class assignment | Reviewed eligibility, reproducible allocation, transactional rollover | 5 |
| SF9 and cumulative SF10 | Frozen report versions, controlled correction, private artifact retrieval | 6 |
| Confidentiality and at least 27 concurrent teachers | Database authorization, access tests, load tests, audit, recovery | Every section |

## Findings that change implementation

**The grading description needs a policy update.** The paper describes four-quarter-style workflows, WW/PT/QA, and transmutation, while its bibliography includes the June 2026 revised grading order. DepEd's official site also lists the April 2026 three-term calendar order. Consequently, the foundation stores reporting periods as records per school year. It does not hard-code four quarters or any grading formula. The existence and titles of these orders were verified on official pages; the full revised grading enclosure was not retrievable during this pass. Exact grade-band rules remain a research and school-validation task for Section 4. [DO 009, s. 2026](https://www.deped.gov.ph/2026/04/16/april-16-2026-do-009-s-2026-guidelines-on-the-implementation-of-the-three-term-school-calendar-in-basic-education/), [DO 015, s. 2026](https://www.deped.gov.ph/2026/06/04/june-4-2026-do-015-s-2026-revised-guidelines-on-classroom-assessment-grading-system-and-awards-and-recognition-for-the-k-to-12-basic-education-program/).

**Teacher roster permissions need reconciliation.** The requirements say administrators assign teachers to sections, but also say teachers create their assigned classes and pull learners from the central repository. Unrestricted repository access would conflict with the requirement that teachers see only assigned learners. Section 1 lets managers create sections and assign advisers. Section 2 should introduce a scoped unassigned-learner pool or an approval workflow once the school chooses the process.

**Attendance marks alone cannot produce SF4.** Late enrollment, transfers, dropouts, enrollment as of month-end, and school-day denominators require dated enrollment/movement events and a school calendar. Missing attendance must remain unknown until resolved; silently counting missing marks as present or absent would corrupt reports.

**Final records need review and correction rules.** A printed or released form must be reproducible after a learner changes section or a teacher corrects a score. Reporting should use immutable release versions with an explicit correction trail. Replacing an old grade or adviser name in place is insufficient for historical forms.

**Kindergarten must have an explicit policy.** A numeric Grade 1–6 calculation should not automatically apply to Kindergarten. The foundation uses grade level `0` for Kindergarten and `1` through `6` for elementary grades. Assessment behavior is deferred until the correct policy and forms are confirmed.

**Usability evaluation does not establish production correctness.** TAM can measure usefulness and ease of use, but permission tests, grade fixtures, concurrent-write tests, backup restoration, and matched official-form output are additional acceptance evidence.

## Information needed at the relevant section

| When | School decision or source needed |
|---|---|
| Cloud setup | School-controlled Vercel/Supabase owners, development project, initial principal identity, hosting budget and region |
| Section 2 | Official school ID, actual grade levels, learner fields/forms, LRN exceptions, class capacity, roster assignment authority |
| Section 3 | Approved SF2/SF4 samples, AM/PM mark meanings, half-day rules, holidays/suspensions, transfer effective-date rules, approval workflow |
| Section 4 | Current grading enclosure, grade-specific curriculum/subjects, ECR examples, rounding, term weights, MPS/GWA definitions, remediation and missing-score rules |
| Section 5 | Promotion authority and exceptions, allocation constraints, capacity, gender/other grouping policy if authorized by the school |
| Section 6 | Blank approved SF2/SF4/SF9/SF10 templates, signatories, release/correction process, access and retention rules |
| Before real learner data | School privacy owner, approved purposes and fields, hosting/vendor arrangements, recovery objectives, tested backup/restore, staff training |

Philippine privacy law treats education information as sensitive personal information. That supports data minimization, constrained staff access, and protected handling as design requirements. This analysis is not a certification of legal compliance. [National Privacy Commission: Data Privacy Act](https://privacy.gov.ph/data-privacy-act/).

## Manuscript improvements

Reconcile the 30-teacher staffing figure with the minimum 27-concurrent-user target; neither number is necessarily wrong, but the acceptance load should be explicit. Clarify manager-versus-teacher class creation and how old advisers retain or lose historical access. Define report statuses, correction authority, and promotion exceptions. Specify measurable processing and recovery targets with the school.

The extracted document includes Chapter 3 while the table of contents lists Chapters 1 and 2, and it repeats `3.1.1` for the interviews and SRS. Some methodology text describes future work while other passages describe completed work. Align the structure and tense with the actual project stage. Standardize “learner” versus “student” terminology. Verify bibliographic entries individually before submission; this backend-focused pass did not validate every cited study or DOI.
