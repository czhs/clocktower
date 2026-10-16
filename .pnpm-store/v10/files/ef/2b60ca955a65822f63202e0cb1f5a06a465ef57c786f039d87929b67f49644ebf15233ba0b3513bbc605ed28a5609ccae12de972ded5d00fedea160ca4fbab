"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Movement = exports.VelocityInputController = void 0;
const becsy_1 = require("@lastolivegames/becsy");
const readline_1 = require("readline");
const symbols_1 = require("./types/symbols");
const EncodeOperation_1 = require("./encoder/EncodeOperation");
const DecodeOperation_1 = require("./decoder/DecodeOperation");
const spec_1 = require("./encoding/spec");
const Metadata_1 = require("./Metadata");
let Position = class Position {
};
__decorate([
    becsy_1.field.float64
], Position.prototype, "x", void 0);
__decorate([
    becsy_1.field.float64
], Position.prototype, "y", void 0);
Position = __decorate([
    becsy_1.component
], Position);
let Velocity = class Velocity {
};
__decorate([
    becsy_1.field.float64
], Velocity.prototype, "vx", void 0);
__decorate([
    becsy_1.field.float64
], Velocity.prototype, "vy", void 0);
Velocity = __decorate([
    becsy_1.component
], Velocity);
let VelocityInputController = class VelocityInputController extends becsy_1.System {
    constructor() {
        super(...arguments);
        // Every system can define any number of queries whose results will be available in the `execute`
        // method.  In this case, we're asking for all entities that currently have a Velocity component,
        // and declare that we'll be writing to those components.
        this.movables = this.query(q => q.current.with(Velocity).write);
        // Here we'll store all keys that are currently pressed.  This is not specific to ECS but it's a
        // common pattern to glue together event-driven (DOM) and timing-driven (ECS) processes.
        this.keysPressed = new Set();
    }
    // Every system can provide an `initialize` method that will be called once as the world is being
    // set up.  We'll use it to register our DOM event handlers.
    initialize() {
        // Listen for keypress events
        const timeouts = {};
        process.stdin.on('keypress', (str, key) => {
            if (key.ctrl && key.name === 'c') {
                // If Ctrl+C is pressed, exit the program
                rl.close();
            }
            else {
                // Print the key pressed
                this.keysPressed.add(key.name);
                if (timeouts[key.name]) {
                    clearTimeout(timeouts[key.name]);
                }
                timeouts[key.name] = setTimeout(() => {
                    this.keysPressed.delete(key.name);
                    delete timeouts[key.name];
                }, 100);
            }
        });
    }
    // Every system can (and probably should) provide an `execute` method that implements its logic.
    // It will be invoked once per frame in our demo, so at 60fps it's called 60 times per second.
    execute() {
        // We loop through the query results of the movables query we defined above.
        for (const movable of this.movables.current) {
            // This is how we access the data stored in the Velocity component of our movable entity.
            // We must specify whether we intend to only `read` the data or also to `write` it.  We'll
            // only be allowed to `write` to component types that we reserved as such in our queries.
            const velocity = movable.write(Velocity);
            if (this.keysPressed.has('up'))
                velocity.vy = -100; // in pixels per second
            else if (this.keysPressed.has('down'))
                velocity.vy = 100;
            else
                velocity.vy = 0;
            if (this.keysPressed.has('left'))
                velocity.vx = -100;
            else if (this.keysPressed.has('right'))
                velocity.vx = 100;
            else
                velocity.vx = 0;
        }
    }
};
exports.VelocityInputController = VelocityInputController;
exports.VelocityInputController = VelocityInputController = __decorate([
    becsy_1.system
], VelocityInputController);
let Movement = class Movement extends becsy_1.System {
    constructor() {
        super(...arguments);
        this.movables = this.query(q => q.current.with(Velocity).and.with(Position).write);
    }
    execute() {
        for (const movable of this.movables.current) {
            // We retrive both velocity (to read) and position (to write) from our entities.
            const velocity = movable.read(Velocity);
            const position = movable.write(Position);
            // In the execute method, a system has access to `this.delta`, which is the delta time between
            // the current frame and the previous one.  This allows us to calculate a stable movement
            // regardless of the intervals between our frames.  For more on that see
            // https://drewcampbell92.medium.com/understanding-delta-time-b53bf4781a03.
            position.x += this.delta * velocity.vx;
            position.y += this.delta * velocity.vy;
            console.log("x:", position.x, "y:", position.y);
        }
    }
};
exports.Movement = Movement;
exports.Movement = Movement = __decorate([
    becsy_1.system
], Movement);
Metadata_1.Metadata.setFields(becsy_1.World, {
    x: "number",
    y: "number",
    z: "number",
});
becsy_1.World[symbols_1.$encoder] = EncodeOperation_1.encodeSchemaOperation;
becsy_1.World[symbols_1.$decoder] = DecodeOperation_1.decodeSchemaOperation;
becsy_1.World[symbols_1.$track] = function (changeTree, index, operation = spec_1.OPERATION.ADD) {
    changeTree.change(index, operation);
};
async function main() {
    // We can now create the world that all our entities and their components will live in.  All system
    // and component classes tagged with `@system` and `@component` will be automatically added to the
    // world's `defs`, and in this case we don't need to add any other types manually.
    const world = await becsy_1.World.create();
    // Now we create the entity that will represent our object and add the components it will need.
    // Each component type can be optionally followed by an object with initial field values.
    world.createEntity(Position, Velocity);
    // Finally, we set up our game loop.  The `run` function will be executed once per frame.
    async function run() {
        // Execute the world, which will call the `execute` method of all systems in sequence.  The call
        // is asynchronous and we _must_ await its result, otherwise errors won't be reported properly.
        await world.execute();
    }
    setInterval(() => run(), 1000 / 30);
}
main();
// Create an interface for reading input
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
// Start listening for input
process.stdin.setRawMode(true);
process.stdin.resume();
//# sourceMappingURL=ecs.js.map