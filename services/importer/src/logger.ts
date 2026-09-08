type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): number {
  const raw = process.env.LOG_LEVEL;
  if (raw && raw in LEVELS) {
    return LEVELS[raw as Level];
  }
  return LEVELS.info;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) {
    return;
  }
  const record = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') {
    console.error(record);
  } else {
    console.log(record);
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
};
