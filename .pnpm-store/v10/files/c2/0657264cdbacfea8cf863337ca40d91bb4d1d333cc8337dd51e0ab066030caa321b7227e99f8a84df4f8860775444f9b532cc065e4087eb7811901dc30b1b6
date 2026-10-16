"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDecoderStateCallbacks = getDecoderStateCallbacks;
const spec_1 = require("../../encoding/spec");
const Schema_1 = require("../../Schema");
function getDecoderStateCallbacks(decoder) {
    const $root = decoder.root;
    const callbacks = $root.callbacks;
    const onAddCalls = new WeakMap();
    let currentOnAddCallback;
    decoder.triggerChanges = function (allChanges) {
        const uniqueRefIds = new Set();
        for (let i = 0, l = allChanges.length; i < l; i++) {
            const change = allChanges[i];
            const refId = change.refId;
            const ref = change.ref;
            const $callbacks = callbacks[refId];
            if (!$callbacks) {
                continue;
            }
            //
            // trigger onRemove on child structure.
            //
            if ((change.op & spec_1.OPERATION.DELETE) === spec_1.OPERATION.DELETE &&
                change.previousValue instanceof Schema_1.Schema) {
                const deleteCallbacks = callbacks[$root.refIds.get(change.previousValue)]?.[spec_1.OPERATION.DELETE];
                for (let i = deleteCallbacks?.length - 1; i >= 0; i--) {
                    deleteCallbacks[i]();
                }
            }
            if (ref instanceof Schema_1.Schema) {
                //
                // Handle schema instance
                //
                if (!uniqueRefIds.has(refId)) {
                    // trigger onChange
                    const replaceCallbacks = $callbacks?.[spec_1.OPERATION.REPLACE];
                    for (let i = replaceCallbacks?.length - 1; i >= 0; i--) {
                        replaceCallbacks[i]();
                        // try {
                        // } catch (e) {
                        //     console.error(e);
                        // }
                    }
                }
                if ($callbacks.hasOwnProperty(change.field)) {
                    const fieldCallbacks = $callbacks[change.field];
                    for (let i = fieldCallbacks?.length - 1; i >= 0; i--) {
                        fieldCallbacks[i](change.value, change.previousValue);
                        // try {
                        // } catch (e) {
                        //     console.error(e);
                        // }
                    }
                }
            }
            else {
                //
                // Handle collection of items
                //
                if ((change.op & spec_1.OPERATION.DELETE) === spec_1.OPERATION.DELETE) {
                    //
                    // FIXME: `previousValue` should always be available.
                    //
                    if (change.previousValue !== undefined) {
                        // triger onRemove
                        const deleteCallbacks = $callbacks[spec_1.OPERATION.DELETE];
                        for (let i = deleteCallbacks?.length - 1; i >= 0; i--) {
                            deleteCallbacks[i](change.previousValue, change.dynamicIndex ?? change.field);
                        }
                    }
                    // Handle DELETE_AND_ADD operations
                    if ((change.op & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) {
                        const addCallbacks = $callbacks[spec_1.OPERATION.ADD];
                        for (let i = addCallbacks?.length - 1; i >= 0; i--) {
                            addCallbacks[i](change.value, change.dynamicIndex ?? change.field);
                        }
                    }
                }
                else if ((change.op & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD &&
                    change.previousValue !== change.value) {
                    // triger onAdd
                    const addCallbacks = $callbacks[spec_1.OPERATION.ADD];
                    for (let i = addCallbacks?.length - 1; i >= 0; i--) {
                        addCallbacks[i](change.value, change.dynamicIndex ?? change.field);
                    }
                }
                // trigger onChange
                if (change.value !== change.previousValue &&
                    // FIXME: see "should not encode item if added and removed at the same patch" test case.
                    // some "ADD" + "DELETE" operations on same patch are being encoded as "DELETE"
                    (change.value !== undefined || change.previousValue !== undefined)) {
                    const replaceCallbacks = $callbacks[spec_1.OPERATION.REPLACE];
                    for (let i = replaceCallbacks?.length - 1; i >= 0; i--) {
                        replaceCallbacks[i](change.value, change.dynamicIndex ?? change.field);
                    }
                }
            }
            uniqueRefIds.add(refId);
        }
    };
    function getProxy(metadataOrType, context) {
        let metadata = context.instance?.constructor[Symbol.metadata] || metadataOrType;
        let isCollection = ((context.instance && typeof (context.instance['forEach']) === "function") ||
            (metadataOrType && typeof (metadataOrType[Symbol.metadata]) === "undefined"));
        if (metadata && !isCollection) {
            const onAddListen = function (ref, prop, callback, immediate) {
                // immediate trigger
                if (immediate &&
                    context.instance[prop] !== undefined &&
                    !onAddCalls.has(currentOnAddCallback) // Workaround for https://github.com/colyseus/schema/issues/147
                ) {
                    callback(context.instance[prop], undefined);
                }
                return $root.addCallback($root.refIds.get(ref), prop, callback);
            };
            /**
             * Schema instances
             */
            return new Proxy({
                listen: function listen(prop, callback, immediate = true) {
                    if (context.instance) {
                        return onAddListen(context.instance, prop, callback, immediate);
                    }
                    else {
                        // collection instance not received yet
                        let detachCallback = () => { };
                        context.onInstanceAvailable((ref, existing) => {
                            detachCallback = onAddListen(ref, prop, callback, immediate && existing && !onAddCalls.has(currentOnAddCallback));
                        });
                        return () => detachCallback();
                    }
                },
                onChange: function onChange(callback) {
                    return $root.addCallback($root.refIds.get(context.instance), spec_1.OPERATION.REPLACE, callback);
                },
                //
                // TODO: refactor `bindTo()` implementation.
                // There is room for improvement.
                //
                bindTo: function bindTo(targetObject, properties) {
                    if (!properties) {
                        properties = Object.keys(metadata).map((index) => metadata[index].name);
                    }
                    return $root.addCallback($root.refIds.get(context.instance), spec_1.OPERATION.REPLACE, () => {
                        properties.forEach((prop) => targetObject[prop] = context.instance[prop]);
                    });
                }
            }, {
                get(target, prop) {
                    const metadataField = metadata[metadata[prop]];
                    if (metadataField) {
                        const instance = context.instance?.[prop];
                        const onInstanceAvailable = ((callback) => {
                            const unbind = $(context.instance).listen(prop, (value, _) => {
                                callback(value, false);
                                // FIXME: by "unbinding" the callback here,
                                // it will not support when the server
                                // re-instantiates the instance.
                                //
                                unbind?.();
                            }, false);
                            // has existing value
                            if ($root.refIds.get(instance) !== undefined) {
                                callback(instance, true);
                            }
                        });
                        return getProxy(metadataField.type, {
                            // make sure refId is available, otherwise need to wait for the instance to be available.
                            instance: ($root.refIds.get(instance) && instance),
                            parentInstance: context.instance,
                            onInstanceAvailable,
                        });
                    }
                    else {
                        // accessing the function
                        return target[prop];
                    }
                },
                has(target, prop) { return metadata[prop] !== undefined; },
                set(_, _1, _2) { throw new Error("not allowed"); },
                deleteProperty(_, _1) { throw new Error("not allowed"); },
            });
        }
        else {
            /**
             * Collection instances
             */
            const onAdd = function (ref, callback, immediate) {
                // Trigger callback on existing items
                if (immediate) {
                    ref.forEach((v, k) => callback(v, k));
                }
                return $root.addCallback($root.refIds.get(ref), spec_1.OPERATION.ADD, (value, key) => {
                    onAddCalls.set(callback, true);
                    currentOnAddCallback = callback;
                    callback(value, key);
                    onAddCalls.delete(callback);
                    currentOnAddCallback = undefined;
                });
            };
            const onRemove = function (ref, callback) {
                return $root.addCallback($root.refIds.get(ref), spec_1.OPERATION.DELETE, callback);
            };
            const onChange = function (ref, callback) {
                return $root.addCallback($root.refIds.get(ref), spec_1.OPERATION.REPLACE, callback);
            };
            return new Proxy({
                onAdd: function (callback, immediate = true) {
                    //
                    // https://github.com/colyseus/schema/issues/147
                    // If parent instance has "onAdd" registered, avoid triggering immediate callback.
                    //
                    if (context.instance) {
                        return onAdd(context.instance, callback, immediate && !onAddCalls.has(currentOnAddCallback));
                    }
                    else if (context.onInstanceAvailable) {
                        // collection instance not received yet
                        let detachCallback = () => { };
                        context.onInstanceAvailable((ref, existing) => {
                            detachCallback = onAdd(ref, callback, immediate && existing && !onAddCalls.has(currentOnAddCallback));
                        });
                        return () => detachCallback();
                    }
                },
                onRemove: function (callback) {
                    if (context.instance) {
                        return onRemove(context.instance, callback);
                    }
                    else if (context.onInstanceAvailable) {
                        // collection instance not received yet
                        let detachCallback = () => { };
                        context.onInstanceAvailable((ref) => {
                            detachCallback = onRemove(ref, callback);
                        });
                        return () => detachCallback();
                    }
                },
                onChange: function (callback) {
                    if (context.instance) {
                        return onChange(context.instance, callback);
                    }
                    else if (context.onInstanceAvailable) {
                        // collection instance not received yet
                        let detachCallback = () => { };
                        context.onInstanceAvailable((ref) => {
                            detachCallback = onChange(ref, callback);
                        });
                        return () => detachCallback();
                    }
                },
            }, {
                get(target, prop) {
                    if (!target[prop]) {
                        throw new Error(`Can't access '${prop}' through callback proxy. access the instance directly.`);
                    }
                    return target[prop];
                },
                has(target, prop) { return target[prop] !== undefined; },
                set(_, _1, _2) { throw new Error("not allowed"); },
                deleteProperty(_, _1) { throw new Error("not allowed"); },
            });
        }
    }
    function $(instance) {
        return getProxy(undefined, { instance });
    }
    return $;
}
//# sourceMappingURL=StateCallbacks.js.map