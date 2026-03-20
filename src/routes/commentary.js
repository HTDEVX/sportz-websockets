import { Router } from 'express';
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';
import { matchIdParamSchema } from '../validation/matches.js';
import { createCommentarySchema } from '../validation/commentary.js';

export const commentaryRouter = Router({ mergeParams: true });

commentaryRouter.post('/', async (req, res) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: 'Invalid match ID in URL params', details: JSON.stringify(paramsParsed.error) });
  }
  
  const bodyParsed = createCommentarySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Invalid commentary payload', details: JSON.stringify(bodyParsed.error) });
  }
  console.log('Parsed body:', bodyParsed);

  const matchId = paramsParsed.data.id;
  const { minute, sequence, period, eventType, actor, team, message, metadata, tags } = bodyParsed.data;

  try {
    const [createdCommentary] = await db
      .insert(commentary)
      .values({
        matchId,
        minute,
        sequence,
        period,
        eventType,
        actor,
        team,
        message,
        metadata,
        tags,
      })
      .returning();

    try {
      if (req.app.locals.broadcastCommentaryAdded) {
        req.app.locals.broadcastCommentaryAdded(matchId, createdCommentary);
      }
    } catch (broadcastError) {
        console.error('Failed to broadcast commentary', broadcastError);
    }

    return res.status(201).json({ message: 'Commentary created', data: createdCommentary });
  } catch (error) {
    console.error('Failed to create commentary', error);
    return res.status(500).json({ error: 'Failed to create commentary' });
  }
});
