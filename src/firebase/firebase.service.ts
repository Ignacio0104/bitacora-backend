import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseService {
  constructor(config: ConfigService) {
    if (!getApps().length) {
      const path = config.getOrThrow<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
      initializeApp({
        credential: cert(JSON.parse(readFileSync(path, 'utf8'))),
      });
    }
  }

  verifyIdToken(idToken: string) {
    return getAuth().verifyIdToken(idToken);
  }
}
