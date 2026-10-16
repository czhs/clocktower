import { TypeContext } from "../types/TypeContext";
import { Schema } from "../Schema";
import type { Ref } from "../encoder/ChangeTree";
import type { Iterator } from "../encoding/decode";
import { ReferenceTracker } from "./ReferenceTracker";
import { type DataChange } from "./DecodeOperation";
import { Collection } from "../types/HelperTypes";
export declare class Decoder<T extends Schema = any> {
    context: TypeContext;
    state: T;
    root: ReferenceTracker;
    currentRefId: number;
    triggerChanges?: (allChanges: DataChange[]) => void;
    constructor(root: T, context?: TypeContext);
    protected setState(root: T): void;
    decode(bytes: Buffer, it?: Iterator, ref?: Ref): DataChange<any, string>[];
    skipCurrentStructure(bytes: Buffer, it: Iterator, totalBytes: number): void;
    getInstanceType(bytes: Buffer, it: Iterator, defaultType: typeof Schema): typeof Schema;
    createInstanceOfType(type: typeof Schema): Schema;
    removeChildRefs(ref: Collection, allChanges: DataChange[]): void;
}
