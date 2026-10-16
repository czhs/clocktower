import { OPERATION } from "../encoding/spec";
import { Schema } from "../Schema";
import { $changes, $decoder, $encoder, $getByIndex, type $deleteByIndex } from "../types/symbols";
import type { MapSchema } from "../types/custom/MapSchema";
import type { ArraySchema } from "../types/custom/ArraySchema";
import type { CollectionSchema } from "../types/custom/CollectionSchema";
import type { SetSchema } from "../types/custom/SetSchema";
import { Root } from "./Root";
import { Metadata } from "../Metadata";
import type { EncodeOperation } from "./EncodeOperation";
import type { DecodeOperation } from "../decoder/DecodeOperation";
declare global {
    interface Object {
        [$changes]?: ChangeTree;
        [$encoder]?: EncodeOperation;
        [$decoder]?: DecodeOperation;
    }
}
export interface IRef {
    [$changes]?: ChangeTree;
    [$getByIndex]?: (index: number, isEncodeAll?: boolean) => any;
    [$deleteByIndex]?: (index: number) => void;
}
export type Ref = Schema | ArraySchema | MapSchema | CollectionSchema | SetSchema;
export type ChangeSetName = "changes" | "allChanges" | "filteredChanges" | "allFilteredChanges";
export interface IndexedOperations {
    [index: number]: OPERATION;
}
export interface ChangeTreeNode {
    changeTree: ChangeTree;
    next?: ChangeTreeNode;
    prev?: ChangeTreeNode;
    position: number;
}
export interface ChangeTreeList {
    next?: ChangeTreeNode;
    tail?: ChangeTreeNode;
}
export interface ChangeSet {
    indexes: {
        [index: number]: number;
    };
    operations: number[];
    queueRootNode?: ChangeTreeNode;
}
export declare function createChangeTreeList(): ChangeTreeList;
export declare function setOperationAtIndex(changeSet: ChangeSet, index: number): void;
export declare function deleteOperationAtIndex(changeSet: ChangeSet, index: number | string): void;
export declare function debugChangeSet(label: string, changeSet: ChangeSet): void;
export interface ParentChain {
    ref: Ref;
    index: number;
    next?: ParentChain;
}
export declare class ChangeTree<T extends Ref = any> {
    ref: T;
    refId: number;
    metadata: Metadata;
    root?: Root;
    parentChain?: ParentChain;
    /**
     * Whether this structure is parent of a filtered structure.
     */
    isFiltered: boolean;
    isVisibilitySharedWithParent?: boolean;
    indexedOperations: IndexedOperations;
    changes: ChangeSet;
    allChanges: ChangeSet;
    filteredChanges: ChangeSet;
    allFilteredChanges: ChangeSet;
    indexes: {
        [index: string]: any;
    };
    /**
     * Is this a new instance? Used on ArraySchema to determine OPERATION.MOVE_AND_ADD operation.
     */
    isNew: boolean;
    constructor(ref: T);
    setRoot(root: Root): void;
    setParent(parent: Ref, root?: Root, parentIndex?: number): void;
    forEachChild(callback: (change: ChangeTree, at: any) => void): void;
    operation(op: OPERATION): void;
    change(index: number, operation?: OPERATION): void;
    shiftChangeIndexes(shiftIndex: number): void;
    shiftAllChangeIndexes(shiftIndex: number, startIndex?: number): void;
    private _shiftAllChangeIndexes;
    indexedOperation(index: number, operation: OPERATION, allChangesIndex?: number): void;
    getType(index?: number): any;
    getChange(index: number): OPERATION;
    getValue(index: number, isEncodeAll?: boolean): any;
    delete(index: number, operation?: OPERATION, allChangesIndex?: number): any;
    endEncode(changeSetName: ChangeSetName): void;
    discard(discardAll?: boolean): void;
    /**
     * Recursively discard all changes from this, and child structures.
     * (Used in tests only)
     */
    discardAll(): void;
    get changed(): boolean;
    protected checkIsFiltered(parent: Ref, parentIndex: number, isNewChangeTree: boolean): void;
    protected _checkFilteredByParent(parent: Ref, parentIndex: number): void;
    /**
     * Get the immediate parent
     */
    get parent(): Ref | undefined;
    /**
     * Get the immediate parent index
     */
    get parentIndex(): number | undefined;
    /**
     * Add a parent to the chain
     */
    addParent(parent: Ref, index: number): void;
    /**
     * Remove a parent from the chain
     * @param parent - The parent to remove
     * @returns true if parent was removed
     */
    removeParent(parent?: Ref): boolean;
    /**
     * Find a specific parent in the chain
     */
    findParent(predicate: (parent: Ref, index: number) => boolean): ParentChain | undefined;
    /**
     * Check if this ChangeTree has a specific parent
     */
    hasParent(predicate: (parent: Ref, index: number) => boolean): boolean;
    /**
     * Get all parents as an array (for debugging/testing)
     */
    getAllParents(): Array<{
        ref: Ref;
        index: number;
    }>;
}
