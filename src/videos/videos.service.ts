import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class VideosService {
  constructor(private prisma: PrismaService) {}

  // Nunca devuelve youtubeId: solo lo necesario para la grilla
  list(roles: string[]) {
    return this.prisma.video.findMany({
      where: { published: true, requiredRoles: { hasSome: roles } },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        durationSeconds: true,
      },
    });
  }

  async playback(id: string, roles: string[]) {
    const video = await this.prisma.video.findFirst({
      where: { id, published: true, requiredRoles: { hasSome: roles } },
      select: { id: true, title: true, youtubeId: true },
    });
    // 404 tanto si no existe como si no tiene permiso: no revela qué videos hay
    if (!video) throw new NotFoundException();
    return video;
  }
}
