import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, publicUser, REFRESH_TTL_MS } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const COOKIE = 'refresh_token';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_TTL_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('session')
  @HttpCode(200)
  async session(
    @Body() body: { idToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.idToken) throw new BadRequestException('Falta idToken');
    const { user, accessToken, refreshToken } = await this.auth.createSession(
      body.idToken,
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, user: publicUser(user) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.refresh(
      req.cookies?.[COOKIE],
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, user: publicUser(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/auth' });
  }
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async me(@Req() req: Request & { user: { sub: string } }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.sub },
    });
    return publicUser(user);
  }
}
