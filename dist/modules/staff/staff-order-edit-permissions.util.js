"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCanEditItems = resolveCanEditItems;
const staff_capability_mapper_1 = require("./staff-capability.mapper");
function resolveCanEditItems(channel, auth, status) {
    if (status === 'delivered' || status === 'cancelled') {
        return false;
    }
    if (!(0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:edit_items')) {
        return false;
    }
    if (channel === 'delivery' && !(0, staff_capability_mapper_1.staffHasPermission)(auth, 'delivery:view')) {
        return false;
    }
    if (channel !== 'table' && channel !== 'delivery') {
        return false;
    }
    return (status === 'pending' || status === 'confirmed' || status === 'prepared');
}
//# sourceMappingURL=staff-order-edit-permissions.util.js.map