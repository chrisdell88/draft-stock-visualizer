import { z } from 'zod';
import { 
  players, 
  mockDrafts, 
  odds,
  adpHistory,
  analysts
} from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  players: {
    list: {
      method: 'GET' as const,
      path: '/api/players' as const,
      responses: {
        200: z.array(z.custom<typeof players.$inferSelect & { currentAdp?: number, trend?: 'up' | 'down' | 'flat' }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/players/:id' as const,
      responses: {
        200: z.custom<typeof players.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    trends: {
      method: 'GET' as const,
      path: '/api/players/:id/trends' as const,
      responses: {
        200: z.object({
          adp: z.array(z.custom<typeof adpHistory.$inferSelect>()),
          odds: z.array(z.custom<typeof odds.$inferSelect>()),
        }),
        404: errorSchemas.notFound,
      }
    },
    rankings: {
      method: 'GET' as const,
      path: '/api/players/:id/rankings' as const,
      responses: {
        200: z.array(z.object({
          sourceName: z.string(),
          pickNumber: z.number(),
          publishedAt: z.string().optional(),
        })),
        404: errorSchemas.notFound,
      }
    }
  },
  analysts: {
    list: {
      method: 'GET' as const,
      path: '/api/analysts' as const,
      responses: {
        200: z.array(z.custom<typeof analysts.$inferSelect>()),
      },
    },
  },
  mockDrafts: {
    list: {
      method: 'GET' as const,
      path: '/api/mock-drafts' as const,
      responses: {
        200: z.array(z.custom<typeof mockDrafts.$inferSelect>()),
      },
    },
    scrape: {
      method: 'POST' as const,
      path: '/api/mock-drafts/scrape' as const,
      input: z.object({ url: z.string().url(), sourceName: z.string() }),
      responses: {
        201: z.object({ message: z.string(), mockDraft: z.custom<typeof mockDrafts.$inferSelect>() }),
        400: errorSchemas.validation,
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
