import type { Schema } from "./Schema";
import { TypeContext } from "./annotations";
import { Root } from "./changes/ChangeTree";
export declare class Encoder<T extends Schema = any> {
    context: TypeContext;
    root: T;
    $root: Root;
    constructor(root: T);
    protected setRoot(root: T): void;
    encode(encodeAll?: boolean, bytes?: number[], useFilters?: boolean): number[];
    encodeAll(useFilters?: boolean): number[];
    tryEncodeTypeId(bytes: number[], baseType: typeof Schema, targetType: typeof Schema): void;
}
