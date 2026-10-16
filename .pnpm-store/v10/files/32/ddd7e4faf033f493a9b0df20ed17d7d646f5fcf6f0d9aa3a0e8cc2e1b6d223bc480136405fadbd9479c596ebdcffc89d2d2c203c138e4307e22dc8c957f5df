import "./symbol.shim";
import { Schema } from './Schema';
import { ArraySchema } from './types/custom/ArraySchema';
import { MapSchema } from './types/custom/MapSchema';
import { TypeDefinition } from "./types/registry";
import { OPERATION } from "./encoding/spec";
import type { InferValueType, InferSchemaInstanceType, AssignableProps } from "./types/HelperTypes";
import { CollectionSchema } from "./types/custom/CollectionSchema";
import { SetSchema } from "./types/custom/SetSchema";
export type RawPrimitiveType = "string" | "number" | "boolean" | "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "int64" | "uint64" | "float32" | "float64" | "bigint64" | "biguint64";
export type PrimitiveType = RawPrimitiveType | typeof Schema | object;
export type DefinitionType<T extends PrimitiveType = PrimitiveType> = T | T[] | {
    type: T;
    default?: InferValueType<T>;
    view?: boolean | number;
} | {
    array: T;
    default?: ArraySchema<InferValueType<T>>;
    view?: boolean | number;
} | {
    map: T;
    default?: MapSchema<InferValueType<T>>;
    view?: boolean | number;
} | {
    collection: T;
    default?: CollectionSchema<InferValueType<T>>;
    view?: boolean | number;
} | {
    set: T;
    default?: SetSchema<InferValueType<T>>;
    view?: boolean | number;
};
export type Definition = {
    [field: string]: DefinitionType;
};
export interface TypeOptions {
    manual?: boolean;
}
export declare const DEFAULT_VIEW_TAG = -1;
export declare function entity(constructor: any): any;
/**
 * [See documentation](https://docs.colyseus.io/state/schema/)
 *
 * Annotate a Schema property to be serializeable.
 * \@type()'d fields are automatically flagged as "dirty" for the next patch.
 *
 * @example Standard usage, with automatic change tracking.
 * ```
 * \@type("string") propertyName: string;
 * ```
 *
 * @example You can provide the "manual" option if you'd like to manually control your patches via .setDirty().
 * ```
 * \@type("string", { manual: true })
 * ```
 */
export declare function view<T>(tag?: number): (target: T, fieldName: string) => void;
export declare function unreliable<T>(target: T, field: string): void;
export declare function type(type: DefinitionType, options?: TypeOptions): PropertyDecorator;
export declare function getPropertyDescriptor(fieldCached: string, fieldIndex: number, type: DefinitionType, complexTypeKlass: TypeDefinition): {
    get: (this: Schema) => ((index: number) => any) | ((index: number) => void) | (() => Schema<any>) | (<T extends Partial<Schema<any>>>(props: AssignableProps<T>) => Schema<any>) | (<K extends never>(property: number | K, operation?: OPERATION) => void) | ((this: any) => import("./types/HelperTypes").ToJSON<Schema<any>>) | (() => void);
    set: (this: Schema, value: any) => void;
    enumerable: boolean;
    configurable: boolean;
};
/**
 * `@deprecated()` flag a field as deprecated.
 * The previous `@type()` annotation should remain along with this one.
 */
export declare function deprecated(throws?: boolean): PropertyDecorator;
export declare function defineTypes(target: typeof Schema, fields: Definition, options?: TypeOptions): typeof Schema;
type ExtractInitProps<T> = T extends {
    initialize: (...args: infer P) => void;
} ? P extends readonly [] ? never : P extends readonly [infer First] ? First extends object ? First : P : P : T extends Definition ? AssignableProps<InferSchemaInstanceType<T>> : never;
type IsInitPropsRequired<T> = T extends {
    initialize: (props: any) => void;
} ? true : T extends {
    initialize: (...args: infer P) => void;
} ? P extends readonly [] ? false : true : false;
export interface SchemaWithExtends<T extends Definition, P extends typeof Schema> {
    extends: <T2 extends Definition = Definition>(fields: T2 & ThisType<InferSchemaInstanceType<T & T2>>, name?: string) => SchemaWithExtendsConstructor<T & T2, ExtractInitProps<T2>, P>;
}
/**
 * Get the type of the schema defined via `schema({...})` method.
 *
 * @example
 * const Entity = schema({
 *     x: "number",
 *     y: "number",
 * });
 * type Entity = SchemaType<typeof Entity>;
 */
export type SchemaType<T extends {
    '~type': any;
}> = T['~type'];
export interface SchemaWithExtendsConstructor<T extends Definition, InitProps, P extends typeof Schema> extends SchemaWithExtends<T, P> {
    '~type': InferSchemaInstanceType<T>;
    new (...args: [InitProps] extends [never] ? [] : InitProps extends readonly any[] ? InitProps : IsInitPropsRequired<T> extends true ? [InitProps] : [InitProps?]): InferSchemaInstanceType<T> & InstanceType<P>;
    prototype: InferSchemaInstanceType<T> & InstanceType<P> & {
        initialize(...args: [InitProps] extends [never] ? [] : InitProps extends readonly any[] ? InitProps : [InitProps]): void;
    };
}
export declare function schema<T extends Record<string, DefinitionType>, P extends typeof Schema = typeof Schema>(fieldsAndMethods: T & ThisType<InferSchemaInstanceType<T>>, name?: string, inherits?: P): SchemaWithExtendsConstructor<T, ExtractInitProps<T>, P>;
export {};
