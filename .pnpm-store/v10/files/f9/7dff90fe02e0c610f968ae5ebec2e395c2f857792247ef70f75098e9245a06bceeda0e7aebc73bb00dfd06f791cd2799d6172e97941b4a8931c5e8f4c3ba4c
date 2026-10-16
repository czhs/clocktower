"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeSet = void 0;
const spec_1 = require("../spec");
class ChangeSet {
    changes = {};
    changed = false;
    allChanges = new Set();
    // definition: SchemaDefinition;
    change(index, operation = spec_1.OPERATION.ADD) {
        const previousChange = this.changes[index];
        if (!previousChange ||
            previousChange.op === spec_1.OPERATION.DELETE ||
            previousChange.op === spec_1.OPERATION.TOUCH // (mazmorra.io's BattleAction issue)
        ) {
            this.changes[index] = {
                op: (!previousChange)
                    ? operation
                    : (previousChange.op === spec_1.OPERATION.DELETE)
                        ? spec_1.OPERATION.DELETE_AND_ADD
                        : operation,
                index
            };
        }
        this.allChanges.add(index);
        this.changed = true;
    }
    discardAll() {
        this.changes = {};
    }
    setParent(...args) {
    }
}
exports.ChangeSet = ChangeSet;
//# sourceMappingURL=ChangeSet.js.map