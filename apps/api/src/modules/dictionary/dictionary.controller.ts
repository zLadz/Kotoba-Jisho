import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DictionaryEntry } from '@kotoba/types';
import { entryParamsSchema, entryResponseSchema, type EntryResponse } from '@kotoba/validation';
import { dictionaryService } from './dictionary.service.js';
import { errorBody } from '../../shared/errors.js';

export function toEntryResponse(entry: DictionaryEntry): EntryResponse {
  return {
    id: entry.id,
    jmdictSeq: entry.jmdictSeq,
    kanji: entry.kanji.map((form) => ({
      text: form.text,
      infos: [...form.infos],
      priorities: [...form.priorities],
    })),
    readings: entry.readings.map((reading) => ({
      text: reading.text,
      noKanji: reading.noKanji,
      restrictions: [...reading.restrictions],
      infos: [...reading.infos],
      priorities: [...reading.priorities],
      romaji: reading.romaji,
    })),
    senses: entry.senses.map((sense) => ({
      partOfSpeech: [...sense.partOfSpeech],
      fields: [...sense.fields],
      misc: [...sense.misc],
      dialects: [...sense.dialects],
      kanjiRestrictions: [...sense.kanjiRestrictions],
      readingRestrictions: [...sense.readingRestrictions],
      glosses: sense.glosses.map((gloss) => ({ language: gloss.language, text: gloss.text })),
    })),
  };
}

export async function getEntry(
  request: FastifyRequest<{ Params: Record<string, string> }>,
  reply: FastifyReply,
): Promise<void> {
  const parsed = entryParamsSchema.safeParse(request.params);
  if (!parsed.success) {
    reply.status(400).send(errorBody('VALIDATION_ERROR', 'Invalid entry id'));
    return;
  }

  const entry = await dictionaryService.getEntryById(parsed.data.id);
  if (!entry) {
    reply.status(404).send(errorBody('ENTRY_NOT_FOUND', 'Entry not found'));
    return;
  }

  reply.send(entryResponseSchema.parse(toEntryResponse(entry)));
}
