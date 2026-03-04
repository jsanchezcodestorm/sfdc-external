import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';

@Injectable()
export class GlobalSearchService {
  search(user: SessionUser, term: string): { q: string; actor: string; results: unknown[] } {
    return {
      q: term,
      actor: user.sub,
      results: []
    };
  }
}
