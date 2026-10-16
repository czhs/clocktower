import { OPERATION } from "../encoding/spec";
import { Schema } from "../Schema";
import type { Ref } from "../encoder/ChangeTree";
import type { Decoder } from "./Decoder";
import { Iterator } from "../encoding/decode";
export interface DataChange<T = any, F = string> {
    ref: Ref;
    refId: number;
    op: OPERATION;
    field: F;
    dynamicIndex?: number | string;
    value: T;
    previousValue: T;
}
export declare const DEFINITION_MISMATCH = -1;
export type DecodeOperation<T extends Schema = any> = (decoder: Decoder<T>, bytes: Buffer, it: Iterator, ref: Ref, allChanges: DataChange[]) => number | void;
export declare function decodeValue<T extends Ref>(decoder: Decoder, operation: OPERATION, ref: T, index: number, type: any, bytes: Buffer, it: Iterator, allChanges: DataChange[]): {
    value: any;
    previousValue: T;
};
export declare const decodeSchemaOperation: DecodeOperation;
export declare const decodeKeyValueOperation: DecodeOperation;
export declare const decodeArray: DecodeOperation;
