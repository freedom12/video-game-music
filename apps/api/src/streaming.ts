import fs from 'node:fs';

import type { FastifyReply } from 'fastify';

const bytesPattern = /^bytes=(\d+)-(\d+)?$/;

export async function streamLocalFile(
  reply: FastifyReply,
  filePath: string,
  mimeType: string,
  rangeHeader: string | string[] | undefined,
) {
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;
  const headerValue = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;

  if (headerValue) {
    const match = bytesPattern.exec(headerValue);

    if (match) {
      const start = Number.parseInt(match[1] ?? '0', 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

      if (start > end || start >= fileSize || end >= fileSize) {
        reply.code(416);
        reply.header('Content-Range', `bytes */${fileSize}`);
        return reply.send();
      }

      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', end - start + 1);
      reply.header('Content-Type', mimeType);
      return fs.createReadStream(filePath, { start, end });
    }
  }

  reply.header('Content-Length', fileSize);
  reply.header('Content-Type', mimeType);
  reply.header('Accept-Ranges', 'bytes');
  return fs.createReadStream(filePath);
}
