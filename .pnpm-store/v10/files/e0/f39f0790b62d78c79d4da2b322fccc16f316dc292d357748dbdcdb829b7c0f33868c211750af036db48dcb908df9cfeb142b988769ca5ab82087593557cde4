import { OPERATION } from './encoding/spec';
import { type DefinitionType } from "./annotations";
import { AssignableProps, NonFunctionPropNames, ToJSON } from './types/HelperTypes';
import { ChangeSetName, ChangeTree, IRef, Ref } from './encoder/ChangeTree';
import { $decoder, $deleteByIndex, $encoder, $filter, $getByIndex, $track } from './types/symbols';
import { StateView } from './encoder/StateView';
import type { Decoder } from './decoder/Decoder';
import type { Metadata } from './Metadata';
/**
 * Schema encoder / decoder
 */
export declare class Schema<C = any> implements IRef {
    static [Symbol.metadata]: Metadata;
    static [$encoder]: import("./encoder/EncodeOperation").EncodeOperation<any>;
    static [$decoder]: import("./decoder/DecodeOperation").DecodeOperation<any>;
    /**
     * Assign the property descriptors required to track changes on this instance.
     * @param instance
     */
    static initialize(instance: any): void;
    static is(type: DefinitionType): boolean;
    /**
     * Track property changes
     */
    static [$track](changeTree: ChangeTree, index: number, operation?: OPERATION): void;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: Schema, index: number, view: StateView): boolean;
    constructor(arg?: C);
    assign<T extends Partial<this>>(props: AssignableProps<T>): this;
    /**
     * (Server-side): Flag a property to be encoded for the next patch.
     * @param instance Schema instance
     * @param property string representing the property name, or number representing the index of the property.
     * @param operation OPERATION to perform (detected automatically)
     */
    setDirty<K extends NonFunctionPropNames<this>>(property: K | number, operation?: OPERATION): void;
    clone(): this;
    toJSON(this: any): ToJSON<this>;
    /**
     * Used in tests only
     * @internal
     */
    discardAllChanges(): void;
    [$getByIndex](index: number): any;
    [$deleteByIndex](index: number): void;
    /**
     * Inspect the `refId` of all Schema instances in the tree. Optionally display the contents of the instance.
     *
     * @param ref Schema instance
     * @param showContents display JSON contents of the instance
     * @returns
     */
    static debugRefIds<T extends Schema>(ref: T, showContents?: boolean, level?: number, decoder?: Decoder, keyPrefix?: string): string;
    static debugRefIdEncodingOrder<T extends Ref>(ref: T, changeSet?: ChangeSetName): number[];
    static debugRefIdsFromDecoder(decoder: Decoder): string;
    /**
     * Return a string representation of the changes on a Schema instance.
     * The list of changes is cleared after each encode.
     *
     * @param instance Schema instance
     * @param isEncodeAll Return "full encode" instead of current change set.
     * @returns
     */
    static debugChanges<T extends Ref>(instance: T, isEncodeAll?: boolean): string;
    static debugChangesDeep<T extends Schema>(ref: T, changeSetName?: "changes" | "allChanges" | "allFilteredChanges" | "filteredChanges"): string;
}
