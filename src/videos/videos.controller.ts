import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { VideosService } from './videos.service.js';

type AuthedRequest = Request & { user: { sub: string; roles: string[] } };

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideosController {
  constructor(private videos: VideosService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.videos.list(req.user.roles);
  }

  @Get(':id/playback')
  playback(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.videos.playback(id, req.user.roles);
  }
}
