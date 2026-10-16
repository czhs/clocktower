import type { Schema } from "../Schema";
import { TypeContext } from "../types/TypeContext";
import type { Iterator } from "../encoding/decode";
import { Root } from "./Root";
import type { StateView } from "./StateView";
import type { ChangeSetName } from "./ChangeTree";
export declare class Encoder<T extends Schema = any> {
    static BUFFER_SIZE: number;
    sharedBuffer: Buffer;
    context: TypeContext;
    state: T;
    root: Root;
    constructor(state: T);
    protected setState(state: T): void;
    encode(it?: Iterator, view?: StateView, buffer?: Buffer, changeSetName?: ChangeSetName, isEncodeAll?: boolean, initialOffset?: number): Buffer;
    encodeAll(it?: Iterator, buffer?: Buffer): Buffer;
    encodeAllView(view: StateView, sharedOffset: number, it: Iterator, bytes?: Buffer): Buffer;
    encodeView(view: StateView, sharedOffset: number, it: Iterator, bytes?: Buffer): Buffer;
    discardChanges(): void;
    tryEncodeTypeId(bytes: Buffer, baseType: typeof Schema, targetType: typeof Schema, it: Iterator): void;
    get hasChanges(): boolean;
}
