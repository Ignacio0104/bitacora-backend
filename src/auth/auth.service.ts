import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { FirebaseService } from '../firebase/firebase.service.js';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  photoUrl: u.photoUrl,
  roles: u.roles,
  profileCompleted: u.profileCompleted,
});

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private firebase: FirebaseService,
    private jwt: JwtService,
  ) {}

  async createSession(idToken: string) {
    let decoded;
    try {
      decoded = await this.firebase.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    const signIn = decoded.firebase.sign_in_provider;
    const provider =
      signIn === 'google.com'
        ? 'google'
        : signIn === 'password'
          ? 'password'
          : null;
    if (!provider || !decoded.email)
      throw new UnauthorizedException('Proveedor no soportado');

    if (provider === 'password' && !decoded.email_verified) {
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    let user = await this.prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (!user) {
      const existing = await this.prisma.user.findUnique({
        where: { email: decoded.email },
      });
      if (existing) throw new ConflictException('Cuenta ya registrada');

      const [firstName, ...rest] = (decoded.name ?? '').trim().split(/\s+/);
      const lastName = rest.join(' ');
      user = await this.prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email,
          provider,
          firstName: provider === 'google' ? firstName || null : null,
          lastName: provider === 'google' ? lastName || null : null,
          photoUrl: decoded.picture ?? null,
          profileCompleted: provider === 'google' && !!firstName && !!lastName,
        },
      });
    }

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user, ...(await this.issueTokens(user)) };
  }

  async refresh(raw: string | undefined) {
    if (!raw) throw new UnauthorizedException();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    // Se relee el usuario de la base: los roles siempre están actualizados
    return { user: stored.user, ...(await this.issueTokens(stored.user)) };
  }

  async logout(raw: string | undefined) {
    if (!raw) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      roles: user.roles,
    });
    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken };
  }
}
