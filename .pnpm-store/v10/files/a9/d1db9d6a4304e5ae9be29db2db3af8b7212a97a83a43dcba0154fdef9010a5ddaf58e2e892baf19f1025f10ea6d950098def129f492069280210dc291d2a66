import { BufferLike } from "../encoding/encode";
import { Iterator } from "../encoding/decode";
export interface TypeDefinition {
    constructor?: any;
    encode?: (bytes: BufferLike, value: any, it: Iterator) => any;
    decode?: (bytes: BufferLike, it: Iterator) => any;
}
export declare const registeredTypes: {
    [identifier: string]: TypeDefinition;
};
export declare function registerType(identifier: string, definition: TypeDefinition): void;
export declare function getIdentifier(klass: any): string;
export declare function getType(identifier: string): TypeDefinition;
export declare function defineCustomTypes<T extends {
    [key: string]: TypeDefinition;
}>(types: T): (t: keyof T) => PropertyDecorator;
