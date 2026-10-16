import type { Schema } from "../Schema";
import type { CollectionSchema } from "../types/custom/CollectionSchema";
import type { MapSchema } from "../types/custom/MapSchema";
import type { SetSchema } from "../types/custom/SetSchema";
import type { ArraySchema } from "../types/custom/ArraySchema";
import type { Ref } from "../encoder/ChangeTree";
export declare class EncodeSchemaError extends Error {
}
export declare function assertType(value: any, type: string, klass: Schema, field: string | number): void;
export declare function assertInstanceType(value: Ref, type: typeof Schema | typeof ArraySchema | typeof MapSchema | typeof CollectionSchema | typeof SetSchema, instance: Ref, field: string | number): void;
