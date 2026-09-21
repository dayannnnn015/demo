# Development deployment and operations

## Current development deployment

**0.28.1 was released on 20 September 2026** as `edunexus-bjt5m3abc-joshs-projects-47d7b071.vercel.app`, aliased to https://edunexus-balili.vercel.app. This is a maintenance release with no migration or new endpoint. All 303 tests, type checks and build passed; live checks verified API 0.28.1, health/readiness/app responses and 401 rejection for all 109 protected operations. The [backend review](backend-review-2026-09-20.md) documents material score-database defects awaiting corrective-migration authorization. These checks are not school-production acceptance. The Vercel project remains disconnected from Git: deploy manually with `vercel --prod --scope joshs-projects-47d7b071`.
