import { desc } from 'drizzle-orm';
import { Router } from 'express';
import { listMatchesQuerySchema, createMatchSchema } from '../validation/matches.js';
import { getMatchStatus } from '../utils/match-status.js';
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';

export const matchesRouter = Router();

const MAX_LIMIT = 100;

matchesRouter.get('/', async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', details: JSON.stringify(parsed.error) });
  }

  const limit = Math.min(parsed.data.limit ?? 20, MAX_LIMIT);

  try {
    const data = await db
                  .select()
                  .from(matches)
                  .orderBy((desc(matches.createdAt)))
                  .limit(limit);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch matches', details: JSON.stringify(error) }); 
  }
});

matchesRouter.post('/', async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: JSON.stringify(parsed.error) });
  }

  const { data: { startTime, endTime, homeScore, awayScore} } = parsed;

  const status = getMatchStatus(startTime, endTime);
  if (!status) {
    return res.status(400).json({ error: 'Invalid date range for status calculation' });
  }

  try {
    const [ event ] = await db.insert(matches).values({
      ...parsed.data,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
      status
    }).returning();

    res.status(201).json({ message: 'Match created', data: event });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create match', details: JSON.stringify(e) });
  }
});