import { Injectable } from '@nestjs/common';

import { Gs1ScanCode, parseGs1Code } from './scan-code.helpers';

@Injectable()
export class Gs1SyntaxService {
  parse(input: string): Gs1ScanCode | null {
    const parsed = parseGs1Code(input);
    if (!parsed) {
      return null;
    }

    return { ...parsed, parser: 'fallback' };
  }
}
