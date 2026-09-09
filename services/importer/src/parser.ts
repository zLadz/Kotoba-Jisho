import { XMLParser } from 'fast-xml-parser';
import type {
  JmdictEntry,
  JmdictGloss,
  JmdictHeader,
  JmdictKanjiForm,
  JmdictReading,
  JmdictSense,
} from './types.js';

interface RecordLike {
  [key: string]: unknown;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
  removeNSPrefix: true,
});

function asRecord(value: unknown): RecordLike {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as RecordLike;
  }
  return {};
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function firstString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

function textOf(node: RecordLike, key: string): string {
  const value = node[key];
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

function decodeEntityCode(value: string): string {
  return value.replace(/&([A-Za-z0-9_-]+);/g, '$1');
}

function decodePredefinedEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function toGloss(raw: unknown): JmdictGloss {
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { language: 'en', text: decodePredefinedEntities(String(raw)) };
  }
  const node = asRecord(raw);
  const rawLanguage = firstString(node['@lang'] ?? node['@xml:lang'] ?? 'en').toLowerCase();
  const text = decodePredefinedEntities(textOf(node, '#text') ?? firstString(node['#text']));
  return { language: rawLanguage || 'en', text };
}

function toKanjiForm(raw: unknown, position: number): JmdictKanjiForm {
  const node = asRecord(raw);
  return {
    position,
    text: textOf(node, 'keb'),
    infos: asArray<string>(node.ke_inf as string[]).map(firstString),
    priorities: asArray<string>(node.ke_pri as string[]).map(firstString),
  };
}

function toReading(raw: unknown, position: number): JmdictReading {
  const node = asRecord(raw);
  return {
    position,
    text: textOf(node, 'reb'),
    noKanji: 're_nokanji' in node,
    restrictions: asArray<string>(node.re_restr as string[]).map(firstString),
    infos: asArray<string>(node.re_inf as string[]).map(firstString),
    priorities: asArray<string>(node.re_pri as string[]).map(firstString),
  };
}

function toSense(raw: unknown, position: number): JmdictSense {
  const node = asRecord(raw);
  const glosses = asArray<unknown>(node.gloss).map(toGloss);
  return {
    position,
    partOfSpeech: asArray<string>(node.pos as string[]).map((v) =>
      decodeEntityCode(firstString(v)),
    ),
    fields: asArray<string>(node.field as string[]).map((v) => decodeEntityCode(firstString(v))),
    misc: asArray<string>(node.misc as string[]).map((v) => decodeEntityCode(firstString(v))),
    dialects: asArray<string>(node.dial as string[]).map((v) => decodeEntityCode(firstString(v))),
    kanjiRestrictions: asArray<string>(node.stagk as string[]).map(firstString),
    readingRestrictions: asArray<string>(node.stagr as string[]).map(firstString),
    glosses,
  };
}

export function parseEntry(xml: string): JmdictEntry {
  const parsed = asRecord(xmlParser.parse(xml));
  const rawEntry = asArray<unknown>(parsed.entry)[0];
  const node = asRecord(rawEntry);
  const sequence = Number(firstString(node.ent_seq));
  const kanji = asArray<unknown>(node.k_ele).map((value, position) => toKanjiForm(value, position));
  const readings = asArray<unknown>(node.r_ele).map((value, position) =>
    toReading(value, position),
  );
  const senses = asArray<unknown>(node.sense).map((value, position) => toSense(value, position));
  return { sequence, kanji, readings, senses };
}

export function parseHeaderBlock(xml: string): JmdictHeader {
  const source = xml.includes('<JMdict') ? xml : `<JMdict>\n${xml}\n</JMdict>`;
  const parsed = asRecord(xmlParser.parse(source));
  const root = asRecord(parsed.JMdict);
  const header = asRecord(root.header);
  const revisions = asArray<string>(header.jmdictRevision as string[])
    .map(firstString)
    .filter(Boolean);
  const fileVersion = firstString(header.fileVersion) || undefined;
  const comments = firstString(header.comments) || undefined;
  const revisionMatch = comments?.match(/Rev\s+([\d.]+)/);
  const derivedRevision = revisionMatch?.[1];
  const today = new Date().toISOString().slice(0, 10);
  const version =
    fileVersion ??
    (revisions[0]
      ? `${revisions[0]}+${today}`
      : derivedRevision
        ? `${derivedRevision}+${today}`
        : today);
  return {
    version,
    revision: revisions.length > 0 ? revisions.join(',') : derivedRevision,
    fileVersion,
    comments,
  };
}
