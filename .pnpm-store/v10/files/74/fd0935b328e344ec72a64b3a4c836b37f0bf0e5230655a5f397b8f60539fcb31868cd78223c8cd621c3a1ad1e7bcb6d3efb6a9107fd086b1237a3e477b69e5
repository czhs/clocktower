import { $changes, $childType, $decoder, $deleteByIndex, $encoder, $filter, $getByIndex, $onEncodeEnd } from "../symbols";
import { Collection } from "../HelperTypes";
import { ChangeTree, type IRef } from "../../encoder/ChangeTree";
import type { StateView } from "../../encoder/StateView";
import type { Schema } from "../../Schema";
export declare class SetSchema<V = any> implements Collection<number, V>, IRef {
    [$changes]: ChangeTree;
    protected [$childType]: string | typeof Schema;
    protected $items: Map<number, V>;
    protected $indexes: Map<number, number>;
    protected deletedItems: {
        [field: string]: V;
    };
    protected $refId: number;
    static [$encoder]: import("../../encoder/EncodeOperation").EncodeOperation<any>;
    static [$decoder]: import("../../decoder/DecodeOperation").DecodeOperation<any>;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: SetSchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    constructor(initialValues?: Array<V>);
    add(value: V): number | false;
    entries(): MapIterator<[number, V]>;
    delete(item: V): boolean;
    clear(): void;
    has(value: V): boolean;
    forEach(callbackfn: (value: V, key: number, collection: SetSchema<V>) => void): void;
    values(): MapIterator<V>;
    get size(): number;
    /** Iterator */
    [Symbol.iterator](): IterableIterator<V>;
    protected setIndex(index: number, key: number): void;
    protected getIndex(index: number): number;
    [$getByIndex](index: number): any;
    [$deleteByIndex](index: number): void;
    protected [$onEncodeEnd](): void;
    toArray(): V[];
    toJSON(): V[];
    clone(isDecoding?: boolean): SetSchema<V>;
}
