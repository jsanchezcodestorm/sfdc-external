import { SetMetadata } from '@nestjs/common';

import { ACL_METADATA_KEY } from '../../app.constants';

export const AclResource = (resourceId: string) => SetMetadata(ACL_METADATA_KEY, resourceId);
