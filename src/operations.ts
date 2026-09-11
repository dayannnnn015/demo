import { operations as foundation } from './modules/foundation/contracts.js';
import { registryOperations } from './modules/registry/contracts.js';
export const operations = [...foundation, ...registryOperations];
