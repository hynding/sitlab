/**
 * character service: the core service, restricted to the signed-in user's own documents
 */

import { ownedService } from '../../../utils/ownership';

export default ownedService('api::character.character');
