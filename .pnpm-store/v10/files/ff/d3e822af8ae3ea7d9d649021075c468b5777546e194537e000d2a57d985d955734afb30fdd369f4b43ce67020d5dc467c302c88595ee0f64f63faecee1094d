"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
// globalThis.interval = setInterval(() => {}, 1000);
// class Item extends Schema {
//     @type("string") name: string;
// }
// class RootState extends Schema {
//     @type([Item]) items = new ArraySchema<Item>();
// }
// const state = new RootState();
// state.items.push(new Item().assign({ name: "hello" }));
// console.log("Encoded:", state.encode());
class Vec3 extends index_1.Schema {
}
__decorate([
    (0, index_1.type)("number")
], Vec3.prototype, "x", void 0);
__decorate([
    (0, index_1.type)("number")
], Vec3.prototype, "y", void 0);
__decorate([
    (0, index_1.type)("number")
], Vec3.prototype, "z", void 0);
class Base extends index_1.Schema {
}
class Entity extends index_1.Schema {
    constructor() {
        super(...arguments);
        this.position = new Vec3().assign({ x: 0, y: 0, z: 0 });
    }
}
__decorate([
    (0, index_1.type)(Vec3)
], Entity.prototype, "position", void 0);
class Player extends Entity {
    constructor() {
        super(...arguments);
        this.rotation = new Vec3().assign({ x: 0, y: 0, z: 0 });
        this.secret = "private info only for this player";
    }
}
__decorate([
    (0, index_1.type)(Vec3)
], Player.prototype, "rotation", void 0);
__decorate([
    (0, index_1.type)("string")
], Player.prototype, "secret", void 0);
class State extends index_1.Schema {
    constructor() {
        super(...arguments);
        // @type({ map: Base }) players = new MapSchema<Entity>();
        this.num = 0;
        this.str = "Hello world!";
        // @type(Entity) entity = new Player().assign({
        //     position: new Vec3().assign({ x: 1, y: 2, z: 3 }),
        //     rotation: new Vec3().assign({ x: 4, y: 5, z: 6 }),
        // });
        this.entities = new index_1.MapSchema();
    }
}
__decorate([
    (0, index_1.type)("number")
], State.prototype, "num", void 0);
__decorate([
    (0, index_1.type)("string")
], State.prototype, "str", void 0);
__decorate([
    (0, index_1.type)({ map: Entity })
], State.prototype, "entities", void 0);
const state = new State();
state.entities.set("one", new Player().assign({
    position: new Vec3().assign({ x: 1, y: 2, z: 3 }),
    rotation: new Vec3().assign({ x: 1, y: 2, z: 3 }),
}));
state.entities.set("two", new Player().assign({
    position: new Vec3().assign({ x: 4, y: 5, z: 6 }),
    rotation: new Vec3().assign({ x: 7, y: 8, z: 9 }),
}));
const encoder = new index_1.Encoder(state);
let encoded = encoder.encode();
console.log(`(${encoded.length})`, [...encoded]);
globalThis.perform = function () {
    for (let i = 0; i < 500000; i++) {
        encoder.encodeAll();
    }
};
function logTime(label, callback) {
    const time = Date.now();
    for (let i = 0; i < 500000; i++) {
        callback();
    }
    console.log(`${label}:`, Date.now() - time);
}
logTime("encode time", () => encoder.encodeAll());
const decoder = new index_1.Decoder(new State());
logTime("decode time", () => decoder.decode(encoded));
// const time = Date.now();
// console.profile();
// for (let i = 0; i < 300000; i++) {
//   state.encodeAll();
// }
// console.profileEnd();
// console.log("encode time:", Date.now() - time);
// const decoded = Reflection.decode(Reflection.encode(state));
// decoded.decode(encoded);
//
// console.log(decoded.toJSON());
//
// const rotation = state.entity.rotation;
// rotation.x = 100;
//
// encoded = state.encode();
// console.log({encoded});
//
// decoded.decode(encoded);
// console.log(decoded.toJSON());
// const time = Date.now();
// for (let i = 0; i < 300000; i++) {
//   const state = new State();
//   state.encode();
// }
// console.log("encode time:", Date.now() - time);
//# sourceMappingURL=v3_bench.js.map