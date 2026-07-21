import { applyProcessRoleFromArgv } from './process-role';

describe('applyProcessRoleFromArgv', () => {
  const original = process.env.PROCESS_ROLE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PROCESS_ROLE;
    } else {
      process.env.PROCESS_ROLE = original;
    }
  });

  it('sets PROCESS_ROLE from --role=', () => {
    delete process.env.PROCESS_ROLE;
    applyProcessRoleFromArgv(['node', 'dist/main', '--role=worker']);
    expect(process.env.PROCESS_ROLE).toBe('worker');
  });
});
