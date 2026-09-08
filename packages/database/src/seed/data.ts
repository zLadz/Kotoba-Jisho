export interface SeedGloss {
  language: string;
  text: string;
}

export interface SeedSense {
  partOfSpeech: string[];
  glosses: string[];
}

export interface SeedEntry {
  jmdictSeq: number;
  kanji: string[];
  readings: string[];
  senses: SeedSense[];
}

export const seedEntries: SeedEntry[] = [
  {
    jmdictSeq: 1410460,
    kanji: ['食べる'],
    readings: ['たべる'],
    senses: [{ partOfSpeech: ['v1', 'vt'], glosses: ['comer', 'alimentar-se'] }],
  },
  {
    jmdictSeq: 1577570,
    kanji: ['飲む'],
    readings: ['のむ'],
    senses: [{ partOfSpeech: ['v5', 'vt'], glosses: ['beber', 'tomar'] }],
  },
  {
    jmdictSeq: 1215810,
    kanji: ['行く'],
    readings: ['いく', 'ゆく'],
    senses: [
      { partOfSpeech: ['v5', 'vi'], glosses: ['ir', 'andar, seguir'] },
      { partOfSpeech: ['v5', 'vi'], glosses: ['chegar a (um estado)', 'alcançar'] },
    ],
  },
  {
    jmdictSeq: 1545870,
    kanji: ['見る'],
    readings: ['みる'],
    senses: [
      { partOfSpeech: ['v1', 'vt'], glosses: ['ver', 'olhar'] },
      { partOfSpeech: ['v1', 'vt'], glosses: ['observar', 'examinar'] },
    ],
  },
  {
    jmdictSeq: 1581480,
    kanji: ['日本'],
    readings: ['にほん', 'にっぽん'],
    senses: [{ partOfSpeech: ['n'], glosses: ['Japão'] }],
  },
  {
    jmdictSeq: 1294040,
    kanji: ['学生'],
    readings: ['がくせい'],
    senses: [{ partOfSpeech: ['n'], glosses: ['estudante', 'aluno'] }],
  },
];
