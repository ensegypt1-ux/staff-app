"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProcessRoleFromArgv = applyProcessRoleFromArgv;
function applyProcessRoleFromArgv(argv = process.argv) {
    for (const arg of argv) {
        if (arg.startsWith('--role=')) {
            const role = arg.slice('--role='.length).trim().toLowerCase();
            if (role === 'api' || role === 'worker' || role === 'all') {
                process.env.PROCESS_ROLE = role;
            }
        }
    }
}
//# sourceMappingURL=process-role.js.map