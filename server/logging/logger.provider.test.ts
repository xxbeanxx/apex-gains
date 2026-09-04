import { describe, expect, it } from 'vitest';

import { enabledLogLevels } from './logger.provider';

describe('enabledLogLevels', () => {
  it('enables the configured level and everything more severe', () => {
    expect(enabledLogLevels('warn')).toEqual(['warn', 'error', 'fatal']);
  });

  it('enables everything at the least severe level', () => {
    expect(enabledLogLevels('verbose')).toEqual(['verbose', 'debug', 'log', 'warn', 'error', 'fatal']);
  });

  it('keeps the default level quieter than debug', () => {
    const levels = enabledLogLevels('log');
    expect(levels).toContain('log');
    expect(levels).not.toContain('debug');
    expect(levels).not.toContain('verbose');
  });

  it('enables only fatal at the most severe level', () => {
    expect(enabledLogLevels('fatal')).toEqual(['fatal']);
  });
});
