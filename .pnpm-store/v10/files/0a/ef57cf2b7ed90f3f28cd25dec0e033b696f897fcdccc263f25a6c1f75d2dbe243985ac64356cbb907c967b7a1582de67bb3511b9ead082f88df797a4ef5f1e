import { $changes, $childType, $decoder, $deleteByIndex, $onEncodeEnd, $encoder, $filter, $getByIndex } from "../symbols";
import { ChangeTree, IRef } from "../../encoder/ChangeTree";
import { Collection } from "../HelperTypes";
import type { StateView } from "../../encoder/StateView";
import type { Schema } from "../../Schema";
export declare class MapSchema<V = any, K extends string = string> implements Map<K, V>, Collection<K, V, [K, V]>, IRef {
    protected childType: new () => V;
    [$changes]: ChangeTree;
    protected [$childType]: string | typeof Schema;
    protected $items: Map<K, V>;
    protected $indexes: Map<number, K>;
    protected deletedItems: {
        [index: string]: V;
    };
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
    static [$filter](ref: MapSchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    constructor(initialValues?: Map<K, V> | Record<K, V>);
    /** Iterator */
    [Symbol.iterator](): IterableIterator<[K, V]>;
    get [Symbol.toStringTag](): string;
    static get [Symbol.species](): typeof MapSchema;
    set(key: K, value: V): this;
    get(key: K): V | undefined;
    delete(key: K): boolean;
    clear(): void;
    has(key: K): boolean;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
    entries(): MapIterator<[K, V]>;
    keys(): MapIterator<K>;
    values(): MapIterator<V>;
    get size(): number;
    protected setIndex(index: number, key: K): void;
    protected getIndex(index: number): K;
    [$getByIndex](index: number): V | undefined;
    [$deleteByIndex](index: number): void;
    protected [$onEncodeEnd](): void;
    toJSON(): any;
    clone(isDecoding?: boolean): MapSchema<V>;
}
