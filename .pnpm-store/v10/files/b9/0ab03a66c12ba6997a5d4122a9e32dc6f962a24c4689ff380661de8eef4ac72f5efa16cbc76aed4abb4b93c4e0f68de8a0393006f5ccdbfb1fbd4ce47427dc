"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const nanoid_1 = require("nanoid");
const _1 = require(".");
const benchmark = require("benchmark");
const suite = new benchmark.Suite();
class AttributeNew extends _1.Schema {
}
__decorate([
    (0, _1.type)("string")
], AttributeNew.prototype, "name", void 0);
__decorate([
    (0, _1.type)("number")
], AttributeNew.prototype, "value", void 0);
class ItemNew extends _1.Schema {
    constructor() {
        super(...arguments);
        this.attributes = new _1.ArraySchema();
    }
}
__decorate([
    (0, _1.type)("number")
], ItemNew.prototype, "price", void 0);
__decorate([
    (0, _1.type)([AttributeNew])
], ItemNew.prototype, "attributes", void 0);
class PositionNew extends _1.Schema {
}
__decorate([
    (0, _1.type)("number")
], PositionNew.prototype, "x", void 0);
__decorate([
    (0, _1.type)("number")
], PositionNew.prototype, "y", void 0);
class PlayerNew extends _1.Schema {
    constructor() {
        super(...arguments);
        this.position = new PositionNew();
        this.items = new _1.MapSchema();
    }
}
__decorate([
    (0, _1.type)(PositionNew)
], PlayerNew.prototype, "position", void 0);
__decorate([
    (0, _1.type)({ map: ItemNew })
], PlayerNew.prototype, "items", void 0);
class StateNew extends _1.Schema {
    constructor() {
        super(...arguments);
        this.players = new _1.MapSchema();
    }
}
__decorate([
    (0, _1.type)({ map: PlayerNew })
], StateNew.prototype, "players", void 0);
__decorate([
    (0, _1.type)("string")
], StateNew.prototype, "currentTurn", void 0);
const state = new StateNew();
for (let i = 0; i < 50; i++) {
    const player = new PlayerNew();
    state.players.set(`p-${(0, nanoid_1.nanoid)()}`, player);
    player.position.x = (i + 1) * 100;
    player.position.y = (i + 1) * 100;
    for (let j = 0; j < 10; j++) {
        const item = new ItemNew();
        item.price = (i + 1) * 50;
        for (let k = 0; k < 5; k++) {
            const attr = new AttributeNew();
            attr.name = `Attribute ${k}`;
            attr.value = k;
            item.attributes.push(attr);
        }
        player.items.set(`item-${j}`, item);
    }
}
_1.Encoder.BUFFER_SIZE = 1024 * 128;
const encoder = new _1.Encoder(state);
// measure time to .encodeAll()
const now = Date.now();
for (let i = 0; i < 1000; i++) {
    encoder.encodeAll();
}
console.log(Date.now() - now);
console.log(Array.from(encoder.encodeAll()).join(","));
//# sourceMappingURL=bench_encode.js.map