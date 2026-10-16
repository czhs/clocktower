import { OPERATION } from "../spec";
import type { ChangeTracker, Ref } from "./ChangeTree";
import type { Encoder } from "../Encoder";
import type { Schema } from "../Schema";
import type { PrimitiveType } from "../annotations";
export type EncodeOperation<T extends Ref = any> = (encoder: Encoder, bytes: number[], changeTree: ChangeTracker<T>, index: number, operation: OPERATION) => void;
export declare function encodePrimitiveType(type: PrimitiveType, bytes: number[], value: any, klass: Schema, field: string | number): void;
export declare function encodeValue(encoder: Encoder, bytes: number[], ref: Schema, type: any, value: any, field: string | number, operation: OPERATION): void;
/**
 * Used for Schema instances.
 * @private
 */
export declare const encodeSchemaOperation: EncodeOperation;
/**
 * Used for collections (MapSchema, ArraySchema, etc.)
 * @private
 */
export declare const encodeKeyValueOperation: EncodeOperation;
