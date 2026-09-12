import { operations as foundation } from './modules/foundation/contracts.js';
import { registryOperations } from './modules/registry/contracts.js';
import { reviewOperations } from './modules/registry-review/contracts.js';
import { timelineOperations } from './modules/enrollment-timeline/contracts.js';
export const operations = [...foundation, ...registryOperations, ...reviewOperations, ...timelineOperations];
