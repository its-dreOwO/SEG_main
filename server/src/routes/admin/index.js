import express from 'express';
import { requireAuth } from '../../auth.js';
import { createUsersAdminRouter } from './users.js';
import { createContentAdminRouter } from './content.js';
import { createModerationAdminRouter } from './moderation.js';
import { createSeoAdminRouter } from './seo.js';

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAuth);
  router.use(createUsersAdminRouter());
  router.use(createContentAdminRouter());
  router.use(createModerationAdminRouter());
  router.use(createSeoAdminRouter());
  return router;
}
