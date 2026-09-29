import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import express from 'express';
// graphql-upload provides ESM-only modules without bundled declaration files.
// @ts-ignore
import uploadMiddleware from 'graphql-upload/graphqlUploadExpress.mjs';
// @ts-ignore
import Upload from 'graphql-upload/GraphQLUpload.mjs';
import { GraphQLError } from 'graphql';
import { db, initialize } from './db.js';
import { root, probe } from './media.js';
import { authConfig, installAuth } from './auth.js';
authConfig();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const present = (v: any) => ({ ...v, createdAt: v.created_at.toISOString(), originalUrl: `/media/${v.id}/original.mp4` });
const typeDefs = `scalar Upload
  type Output { label: String!, url: String!, width: Int, height: Int }
  type Video { id: ID!, name: String!, status: String!, createdAt: String!, originalUrl: String!, outputs: [Output!]!, error: String }
  type Query { videos: [Video!]!, video(id: ID!): Video }
  type Mutation { uploadVideo(file: Upload!): Video! }`;
const resolvers = {
  Upload,
  Query: {
    videos: async () => (await db.query('SELECT * FROM videos ORDER BY created_at DESC LIMIT 100')).rows.map(present),
    video: async (_: unknown, { id }: { id: string }) => {
      if (!uuid.test(id)) throw new GraphQLError('Invalid video ID');
      const result = await db.query('SELECT * FROM videos WHERE id=$1', [id]);
      return result.rows[0] ? present(result.rows[0]) : null;
    },
  },
  Mutation: {
    uploadVideo: async (_: unknown, { file }: { file: Promise<any> }) => {
      const upload = await file;
      if (!/\.mp4$/i.test(upload.filename) || upload.filename.length > 255) throw new GraphQLError('Select an MP4 file');
      const id = randomUUID();
      const dir = `${root}/${id}`;
      let databaseWriteStarted = false;
      try {
        await mkdir(dir);
        await pipeline(upload.createReadStream(), createWriteStream(`${dir}/upload.tmp`, { flags: 'wx' }));
        const { data, video } = await probe(`${dir}/upload.tmp`);
        if (!data.format.format_name.split(',').includes('mp4') || !data.format.tags?.major_brand || data.format.tags.major_brand.trim() === 'qt') throw new Error('Not MP4');
        if (Number(data.format.duration) > 600 || video.width > 4096 || video.height > 4096) throw new Error('Demo limit exceeded');
        await rename(`${dir}/upload.tmp`, `${dir}/original.mp4`);
        databaseWriteStarted = true;
        const result = await db.query('INSERT INTO videos(id,name) VALUES($1,$2) RETURNING *', [id, upload.filename]);
        return present(result.rows[0]);
      } catch {
        // Preserve the original if the INSERT may have committed before a connection loss.
        if (!databaseWriteStarted) await rm(dir, { recursive: true, force: true });
        throw new GraphQLError('Upload failed. Use a valid MP4 up to 512 MiB, 10 minutes and 4096 pixels per side.');
      }
    },
  },
};
@Module({ imports: [GraphQLModule.forRoot({ driver: ApolloDriver, typeDefs, resolvers, csrfPrevention: true, playground: false })] })
class AppModule {}
await mkdir(root, { recursive: true });
await initialize();
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
const http = app.getHttpAdapter().getInstance();
http.get('/health/live', (_: any, res: any) => res.json({ status: 'ok' }));
http.get('/health/ready', async (_: any, res: any) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});
await installAuth(http);
http.use('/media', async (req: any, res: any, next: any) => {
  const parts = req.path.split('/').filter(Boolean);
  if (!uuid.test(parts[0] || '')) return res.sendStatus(404);
  try {
    const row = (await db.query('SELECT status,outputs FROM videos WHERE id=$1', [parts[0]])).rows[0];
    if (!row) return res.sendStatus(404);
    const allowed = parts.length === 2 && parts[1] === 'original.mp4' || row.status === 'READY' && row.outputs.some((o: any) => o.url === `/media${req.path}`);
    if (!allowed) return res.sendStatus(404);
    next();
  } catch { res.sendStatus(503); }
}, express.static(root, { dotfiles: 'deny', index: false, fallthrough: false }));
let uploads = 0;
http.use('/graphql', (req: any, res: any, next: any) => {
  if (!req.is('multipart/form-data')) return next();
  if (req.get('Apollo-Require-Preflight') !== 'true') return res.status(400).json({ error: 'Missing upload preflight header' });
  if (uploads >= 2) return res.status(429).json({ error: 'Upload capacity reached' });
  uploads++;
  res.once('close', () => uploads--);
  next();
}, uploadMiddleware({ maxFileSize: 512 * 1024 * 1024, maxFiles: 1 }));
await app.listen(3000, '0.0.0.0');
app.getHttpServer().requestTimeout = 300000;
