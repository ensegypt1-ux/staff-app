/**
 * Apply CLI `--role=api|worker|all` to PROCESS_ROLE before ConfigModule loads.
 */
export function applyProcessRoleFromArgv(
  argv: string[] = process.argv,
): void {
  for (const arg of argv) {
    if (arg.startsWith('--role=')) {
      const role = arg.slice('--role='.length).trim().toLowerCase();
      if (role === 'api' || role === 'worker' || role === 'all') {
        process.env.PROCESS_ROLE = role;
      }
    }
  }
}
