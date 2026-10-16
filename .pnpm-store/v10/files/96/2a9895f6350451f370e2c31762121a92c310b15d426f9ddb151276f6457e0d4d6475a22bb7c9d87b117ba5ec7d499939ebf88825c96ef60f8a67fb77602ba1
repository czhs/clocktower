import { ChangeTree, IndexedOperations, Ref } from "./ChangeTree";
export declare function createView(iterable?: boolean): StateView;
export declare class StateView {
    iterable: boolean;
    /**
     * Iterable list of items that are visible to this view
     * (Available only if constructed with `iterable: true`)
     */
    items: Ref[];
    /**
     * List of ChangeTree's that are visible to this view
     */
    visible: WeakSet<ChangeTree>;
    /**
     * List of ChangeTree's that are invisible to this view
     */
    invisible: WeakSet<ChangeTree>;
    tags?: WeakMap<ChangeTree, Set<number>>;
    /**
     * Manual "ADD" operations for changes per ChangeTree, specific to this view.
     * (This is used to force encoding a property, even if it was not changed)
     */
    changes: Map<number, IndexedOperations>;
    constructor(iterable?: boolean);
    add(obj: Ref, tag?: number, checkIncludeParent?: boolean): boolean;
    protected addParentOf(childChangeTree: ChangeTree, tag: number): void;
    remove(obj: Ref, tag?: number): this;
    remove(obj: Ref, tag?: number, _isClear?: boolean): this;
    has(obj: Ref): boolean;
    hasTag(ob: Ref, tag?: number): boolean;
    clear(): void;
    isChangeTreeVisible(changeTree: ChangeTree): boolean;
    protected _recursiveDeleteVisibleChangeTree(changeTree: ChangeTree): void;
}
