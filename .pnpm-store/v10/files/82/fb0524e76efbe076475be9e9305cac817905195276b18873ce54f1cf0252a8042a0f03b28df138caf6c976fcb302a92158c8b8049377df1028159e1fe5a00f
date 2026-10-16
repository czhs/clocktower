import { TypeContext } from "./annotations";
import { DataChange, Schema } from "./Schema";
import { Ref } from "./changes/ChangeTree";
import { Iterator } from "./encoding/decode";
import { ReferenceTracker } from "./changes/ReferenceTracker";
export declare class Decoder<T extends Schema = any> {
    context: TypeContext;
    root: T;
    refs: ReferenceTracker;
    currentRefId: number;
    constructor(root: T, context?: TypeContext);
    protected setRoot(root: T): void;
    decode(bytes: number[], it?: Iterator, ref?: Ref): DataChange<any, string>[];
    getInstanceType(bytes: number[], it: Iterator, defaultType: typeof Schema): typeof Schema;
    createInstanceOfType(type: typeof Schema): Schema;
}
