import { Collection, NonFunctionNonPrimitivePropNames, NonFunctionPropNames } from "../../types/HelperTypes";
import { Decoder } from "../Decoder";
import { Schema } from "../../Schema";
/**
 * TODO: define a schema interface, which even having duplicate definitions, it could be used to get the callback proxy.
 *
 * ```ts
 *     export type SchemaCallbackProxy<RoomState> = (<T extends Schema>(instance: T) => CallbackProxy<T>);
 * ```
 */
export type SchemaCallbackProxy<RoomState> = (<T>(instance: T) => CallbackProxy<T>);
export type GetCallbackProxy = SchemaCallbackProxy<any>;
export type CallbackProxy<T> = unknown extends T ? SchemaCallback<T> & CollectionCallback<any, any> : T extends Collection<infer K, infer V, infer _> ? CollectionCallback<K, V> : SchemaCallback<T>;
export type SchemaCallback<T> = {
    /**
     * Trigger callback when value of a property changes.
     *
     * @param prop name of the property
     * @param callback callback to be triggered on property change
     * @param immediate trigger immediatelly if property has been already set.
     * @return callback to detach the listener
     */
    listen<K extends NonFunctionPropNames<T>>(prop: K, callback: (value: T[K], previousValue: T[K]) => void, immediate?: boolean): () => void;
    /**
     * Trigger callback whenever any property changed within this instance.
     *
     * @param prop name of the property
     * @param callback callback to be triggered on property change
     * @param immediate trigger immediatelly if property has been already set.
     * @return callback to detach the listener
     */
    onChange(callback: () => void): () => void;
    /**
     * Bind properties to another object. Changes on the properties will be reflected on the target object.
     *
     * @param targetObject object to bind properties to
     * @param properties list of properties to bind. If not provided, all properties will be bound.
     */
    bindTo(targetObject: any, properties?: Array<NonFunctionPropNames<T>>): void;
} & {
    [K in NonFunctionNonPrimitivePropNames<T>]: CallbackProxy<T[K]>;
};
export type CollectionCallback<K, V> = {
    /**
     * Trigger callback when an item has been added to the collection.
     *
     * @param callback
     * @param immediate
     * @return callback to detach the onAdd listener
     */
    onAdd(callback: (item: V, index: K) => void, immediate?: boolean): () => void;
    /**
     * Trigger callback when an item has been removed to the collection.
     *
     * @param callback
     * @return callback to detach the onRemove listener
     */
    onRemove(callback: (item: V, index: K) => void): () => void;
    /**
     * Trigger callback when the value on a key has changed.
     *
     * THIS METHOD IS NOT RECURSIVE!
     * If you want to listen to changes on individual items, you need to attach callbacks to the them directly inside the `onAdd` callback.
     *
     * @param callback
     * @return callback to detach the onChange listener
     */
    onChange(callback: (item: V, index: K) => void): () => void;
};
export declare function getDecoderStateCallbacks<T extends Schema>(decoder: Decoder<T>): SchemaCallbackProxy<T>;
