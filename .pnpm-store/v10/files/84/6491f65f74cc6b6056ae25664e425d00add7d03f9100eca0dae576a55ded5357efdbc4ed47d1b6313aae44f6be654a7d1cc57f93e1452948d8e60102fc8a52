import { DefinitionType } from "./annotations";
import { $descriptors, $fieldIndexesByViewTag, $numFields, $refTypeFieldIndexes, $viewFieldIndexes } from "./types/symbols";
export type MetadataField = {
    type: DefinitionType;
    name: string;
    index: number;
    tag?: number;
    unreliable?: boolean;
    deprecated?: boolean;
};
export type Metadata = {
    [$numFields]: number;
} & // number of fields
{
    [$viewFieldIndexes]: number[];
} & // all field indexes with "view" tag
{
    [$fieldIndexesByViewTag]: {
        [tag: number]: number[];
    };
} & // field indexes by "view" tag
{
    [$refTypeFieldIndexes]: number[];
} & // all field indexes containing Ref types (Schema, ArraySchema, MapSchema, etc)
{
    [field: number]: MetadataField;
} & // index => field name
{
    [field: string]: number;
} & // field name => field metadata
{
    [$descriptors]: {
        [field: string]: PropertyDescriptor;
    };
};
export declare function getNormalizedType(type: any): DefinitionType;
export declare const Metadata: {
    addField(metadata: any, index: number, name: string, type: DefinitionType, descriptor?: PropertyDescriptor): void;
    setTag(metadata: Metadata, fieldName: string, tag: number): void;
    setFields<T extends {
        new (...args: any[]): InstanceType<T>;
    } = any>(target: T, fields: { [field in keyof InstanceType<T>]?: DefinitionType; }): T;
    isDeprecated(metadata: any, field: string): boolean;
    init(klass: any): void;
    initialize(constructor: any): Metadata;
    isValidInstance(klass: any): boolean;
    getFields(klass: any): any;
    hasViewTagAtIndex(metadata: Metadata, index: number): boolean;
};
