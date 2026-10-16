import { OPERATION } from "../spec";
import { DataChange, Schema } from "../Schema";
import type { Ref } from "./ChangeTree";
import type { Decoder } from "../Decoder";
import * as decode from "../encoding/decode";
export declare enum DecodeState {
    DEFINITION_MISMATCH = 0
}
export type DecodeOperation<T extends Schema = any> = (decoder: Decoder<T>, bytes: number[], it: decode.Iterator, ref: Ref, allChanges: DataChange[]) => void;
export declare function decodeValue(decoder: Decoder, operation: OPERATION, ref: Ref, index: number, type: any, bytes: number[], it: decode.Iterator, allChanges: DataChange[]): {
    value: any;
    previousValue: any;
};
export declare const decodeSchemaOperation: DecodeOperation;
export declare const decodeKeyValueOperation: DecodeOperation;
