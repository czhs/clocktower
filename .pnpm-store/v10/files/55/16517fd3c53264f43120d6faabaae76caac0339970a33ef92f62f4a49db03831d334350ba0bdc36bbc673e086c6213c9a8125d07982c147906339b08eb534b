import { TypeContext } from "../types/TypeContext";
import { ChangeTree, ChangeTreeList, ChangeSetName, type ChangeTreeNode } from "./ChangeTree";
export declare class Root {
    types: TypeContext;
    protected nextUniqueId: number;
    refCount: {
        [id: number]: number;
    };
    changeTrees: {
        [refId: number]: ChangeTree;
    };
    allChanges: ChangeTreeList;
    allFilteredChanges: ChangeTreeList;
    changes: ChangeTreeList;
    filteredChanges: ChangeTreeList;
    constructor(types: TypeContext);
    getNextUniqueId(): number;
    add(changeTree: ChangeTree): boolean;
    remove(changeTree: ChangeTree): number;
    recursivelyMoveNextToParent(changeTree: ChangeTree): void;
    moveNextToParent(changeTree: ChangeTree): void;
    moveNextToParentInChangeTreeList(changeSetName: ChangeSetName, changeTree: ChangeTree): void;
    enqueueChangeTree(changeTree: ChangeTree, changeSet: 'changes' | 'filteredChanges' | 'allFilteredChanges' | 'allChanges', queueRootNode?: ChangeTreeNode): void;
    protected addToChangeTreeList(list: ChangeTreeList, changeTree: ChangeTree): ChangeTreeNode;
    protected updatePositionsAfterRemoval(list: ChangeTreeList, removedPosition: number): void;
    protected updatePositionsAfterMove(list: ChangeTreeList, node: ChangeTreeNode, newPosition: number): void;
    removeChangeFromChangeSet(changeSetName: ChangeSetName, changeTree: ChangeTree): boolean;
}
