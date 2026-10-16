import { OPERATION } from "../spec";
import { ChangeOperation } from "./ChangeTree";
export declare class ChangeSet {
    changes: {
        [index: number]: ChangeOperation;
    };
    changed: boolean;
    allChanges: Set<number>;
    change(index: number, operation?: OPERATION): void;
    discardAll(): void;
    setParent(...args: any[]): void;
}
