import { nanoid } from "nanoid";
import { Schema, type, MapSchema, ArraySchema, Encoder } from ".";
import * as benchmark from "benchmark";

const suite = new benchmark.Suite();

class AttributeNew extends Schema {
    @type("string") name: string;
    @type("number") value: number;
}

class ItemNew extends Schema {
    @type("number") price: number;
    @type([ AttributeNew ]) attributes = new ArraySchema<AttributeNew>();
}

class PositionNew extends Schema {
    @type("number") x: number;
    @type("number") y: number;
}

class PlayerNew extends Schema {
    @type(PositionNew) position = new PositionNew();
    @type({ map: ItemNew }) items = new MapSchema<ItemNew>();
}

class StateNew extends Schema {
    @type({ map: PlayerNew }) players = new MapSchema<PlayerNew>();
    @type("string") currentTurn: string;
}

const state = new StateNew();

for (let i = 0; i < 50; i++) {
    const player = new PlayerNew();
    state.players.set(`p-${nanoid()}`, player);

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

Encoder.BUFFER_SIZE = 1024 * 128;
const encoder = new Encoder(state);

// measure time to .encodeAll()

const now = Date.now();
for (let i = 0; i < 1000; i++) {
    encoder.encodeAll();
}
console.log(Date.now() - now);
console.log(Array.from(encoder.encodeAll()).join(","));
