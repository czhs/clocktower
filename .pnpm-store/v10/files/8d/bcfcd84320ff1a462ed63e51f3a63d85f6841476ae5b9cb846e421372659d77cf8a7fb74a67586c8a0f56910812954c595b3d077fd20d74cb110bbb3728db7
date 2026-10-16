"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArraySchema = void 0;
const symbols_1 = require("../symbols");
const ChangeTree_1 = require("../../encoder/ChangeTree");
const spec_1 = require("../../encoding/spec");
const registry_1 = require("../registry");
const EncodeOperation_1 = require("../../encoder/EncodeOperation");
const DecodeOperation_1 = require("../../decoder/DecodeOperation");
const assert_1 = require("../../encoding/assert");
const DEFAULT_SORT = (a, b) => {
    const A = a.toString();
    const B = b.toString();
    if (A < B)
        return -1;
    else if (A > B)
        return 1;
    else
        return 0;
};
class ArraySchema {
    static { this[_a] = EncodeOperation_1.encodeArray; }
    static { this[_b] = DecodeOperation_1.decodeArray; }
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [(_a = symbols_1.$encoder, _b = symbols_1.$decoder, symbols_1.$filter)](ref, index, view) {
        return (!view ||
            typeof (ref[symbols_1.$childType]) === "string" ||
            view.isChangeTreeVisible(ref['tmpItems'][index]?.[symbols_1.$changes]));
    }
    static is(type) {
        return (
        // type format: ["string"]
        Array.isArray(type) ||
            // type format: { array: "string" }
            (type['array'] !== undefined));
    }
    static from(iterable) {
        return new ArraySchema(...Array.from(iterable));
    }
    constructor(...items) {
        this.items = [];
        this.tmpItems = [];
        this.deletedIndexes = {};
        this.isMovingItems = false;
        Object.defineProperty(this, symbols_1.$childType, {
            value: undefined,
            enumerable: false,
            writable: true,
            configurable: true,
        });
        const proxy = new Proxy(this, {
            get: (obj, prop) => {
                if (typeof (prop) !== "symbol" &&
                    // FIXME: d8 accuses this as low performance
                    !isNaN(prop) // https://stackoverflow.com/a/175787/892698
                ) {
                    return this.items[prop];
                }
                else {
                    return Reflect.get(obj, prop);
                }
            },
            set: (obj, key, setValue) => {
                if (typeof (key) !== "symbol" && !isNaN(key)) {
                    if (setValue === undefined || setValue === null) {
                        obj.$deleteAt(key);
                    }
                    else {
                        if (setValue[symbols_1.$changes]) {
                            (0, assert_1.assertInstanceType)(setValue, obj[symbols_1.$childType], obj, key);
                            const previousValue = obj.items[key];
                            if (!obj.isMovingItems) {
                                obj.$changeAt(Number(key), setValue);
                            }
                            else {
                                if (previousValue !== undefined) {
                                    if (setValue[symbols_1.$changes].isNew) {
                                        obj[symbols_1.$changes].indexedOperation(Number(key), spec_1.OPERATION.MOVE_AND_ADD);
                                    }
                                    else {
                                        if ((obj[symbols_1.$changes].getChange(Number(key)) & spec_1.OPERATION.DELETE) === spec_1.OPERATION.DELETE) {
                                            obj[symbols_1.$changes].indexedOperation(Number(key), spec_1.OPERATION.DELETE_AND_MOVE);
                                        }
                                        else {
                                            obj[symbols_1.$changes].indexedOperation(Number(key), spec_1.OPERATION.MOVE);
                                        }
                                    }
                                }
                                else if (setValue[symbols_1.$changes].isNew) {
                                    obj[symbols_1.$changes].indexedOperation(Number(key), spec_1.OPERATION.ADD);
                                }
                                setValue[symbols_1.$changes].setParent(this, obj[symbols_1.$changes].root, key);
                            }
                            if (previousValue !== undefined) {
                                // remove root reference from previous value
                                previousValue[symbols_1.$changes].root?.remove(previousValue[symbols_1.$changes]);
                            }
                        }
                        else {
                            obj.$changeAt(Number(key), setValue);
                        }
                        obj.items[key] = setValue;
                        obj.tmpItems[key] = setValue;
                    }
                    return true;
                }
                else {
                    return Reflect.set(obj, key, setValue);
                }
            },
            deleteProperty: (obj, prop) => {
                if (typeof (prop) === "number") {
                    obj.$deleteAt(prop);
                }
                else {
                    delete obj[prop];
                }
                return true;
            },
            has: (obj, key) => {
                if (typeof (key) !== "symbol" && !isNaN(Number(key))) {
                    return Reflect.has(this.items, key);
                }
                return Reflect.has(obj, key);
            }
        });
        Object.defineProperty(this, symbols_1.$changes, {
            value: new ChangeTree_1.ChangeTree(proxy),
            enumerable: false,
            writable: true,
        });
        if (items.length > 0) {
            this.push(...items);
        }
        return proxy;
    }
    set length(newLength) {
        if (newLength === 0) {
            this.clear();
        }
        else if (newLength < this.items.length) {
            this.splice(newLength, this.length - newLength);
        }
        else {
            console.warn("ArraySchema: can't set .length to a higher value than its length.");
        }
    }
    get length() {
        return this.items.length;
    }
    push(...values) {
        let length = this.tmpItems.length;
        const changeTree = this[symbols_1.$changes];
        for (let i = 0, l = values.length; i < l; i++, length++) {
            const value = values[i];
            if (value === undefined || value === null) {
                // skip null values
                return;
            }
            else if (typeof (value) === "object" && this[symbols_1.$childType]) {
                (0, assert_1.assertInstanceType)(value, this[symbols_1.$childType], this, i);
                // TODO: move value[$changes]?.setParent() to this block.
            }
            changeTree.indexedOperation(length, spec_1.OPERATION.ADD, this.items.length);
            this.items.push(value);
            this.tmpItems.push(value);
            //
            // set value's parent after the value is set
            // (to avoid encoding "refId" operations before parent's "ADD" operation)
            //
            value[symbols_1.$changes]?.setParent(this, changeTree.root, length);
        }
        return length;
    }
    /**
     * Removes the last element from an array and returns it.
     */
    pop() {
        let index = -1;
        // find last non-undefined index
        for (let i = this.tmpItems.length - 1; i >= 0; i--) {
            // if (this.tmpItems[i] !== undefined) {
            if (this.deletedIndexes[i] !== true) {
                index = i;
                break;
            }
        }
        if (index < 0) {
            return undefined;
        }
        this[symbols_1.$changes].delete(index, undefined, this.items.length - 1);
        this.deletedIndexes[index] = true;
        return this.items.pop();
    }
    at(index) {
        // Allow negative indexing from the end
        if (index < 0)
            index += this.length;
        return this.items[index];
    }
    // encoding only
    $changeAt(index, value) {
        if (value === undefined || value === null) {
            console.error("ArraySchema items cannot be null nor undefined; Use `deleteAt(index)` instead.");
            return;
        }
        // skip if the value is the same as cached.
        if (this.items[index] === value) {
            return;
        }
        const operation = (this.items[index] !== undefined)
            ? typeof (value) === "object"
                ? spec_1.OPERATION.DELETE_AND_ADD // schema child
                : spec_1.OPERATION.REPLACE // primitive
            : spec_1.OPERATION.ADD;
        const changeTree = this[symbols_1.$changes];
        changeTree.change(index, operation);
        //
        // set value's parent after the value is set
        // (to avoid encoding "refId" operations before parent's "ADD" operation)
        //
        value[symbols_1.$changes]?.setParent(this, changeTree.root, index);
    }
    // encoding only
    $deleteAt(index, operation) {
        this[symbols_1.$changes].delete(index, operation);
    }
    // decoding only
    $setAt(index, value, operation) {
        if (index === 0 &&
            operation === spec_1.OPERATION.ADD &&
            this.items[index] !== undefined) {
            // handle decoding unshift
            this.items.unshift(value);
        }
        else if (operation === spec_1.OPERATION.DELETE_AND_MOVE) {
            this.items.splice(index, 1);
            this.items[index] = value;
        }
        else {
            this.items[index] = value;
        }
    }
    clear() {
        // skip if already clear
        if (this.items.length === 0) {
            return;
        }
        // discard previous operations.
        const changeTree = this[symbols_1.$changes];
        // remove children references
        changeTree.forEachChild((childChangeTree, _) => {
            changeTree.root?.remove(childChangeTree);
        });
        changeTree.discard(true);
        changeTree.operation(spec_1.OPERATION.CLEAR);
        this.items.length = 0;
        this.tmpItems.length = 0;
    }
    /**
     * Combines two or more arrays.
     * @param items Additional items to add to the end of array1.
     */
    // @ts-ignore
    concat(...items) {
        return new ArraySchema(...this.items.concat(...items));
    }
    /**
     * Adds all the elements of an array separated by the specified separator string.
     * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
     */
    join(separator) {
        return this.items.join(separator);
    }
    /**
     * Reverses the elements in an Array.
     */
    // @ts-ignore
    reverse() {
        this[symbols_1.$changes].operation(spec_1.OPERATION.REVERSE);
        this.items.reverse();
        this.tmpItems.reverse();
        return this;
    }
    /**
     * Removes the first element from an array and returns it.
     */
    shift() {
        if (this.items.length === 0) {
            return undefined;
        }
        const changeTree = this[symbols_1.$changes];
        const index = this.tmpItems.findIndex(item => item === this.items[0]);
        const allChangesIndex = this.items.findIndex(item => item === this.items[0]);
        changeTree.delete(index, spec_1.OPERATION.DELETE, allChangesIndex);
        changeTree.shiftAllChangeIndexes(-1, allChangesIndex);
        this.deletedIndexes[index] = true;
        return this.items.shift();
    }
    /**
     * Returns a section of an array.
     * @param start The beginning of the specified portion of the array.
     * @param end The end of the specified portion of the array. This is exclusive of the element at the index 'end'.
     */
    slice(start, end) {
        const sliced = new ArraySchema();
        sliced.push(...this.items.slice(start, end));
        return sliced;
    }
    /**
     * Sorts an array.
     * @param compareFn Function used to determine the order of the elements. It is expected to return
     * a negative value if first argument is less than second argument, zero if they're equal and a positive
     * value otherwise. If omitted, the elements are sorted in ascending, ASCII character order.
     * ```ts
     * [11,2,22,1].sort((a, b) => a - b)
     * ```
     */
    sort(compareFn = DEFAULT_SORT) {
        this.isMovingItems = true;
        const changeTree = this[symbols_1.$changes];
        const sortedItems = this.items.sort(compareFn);
        // wouldn't OPERATION.MOVE make more sense here?
        sortedItems.forEach((_, i) => changeTree.change(i, spec_1.OPERATION.REPLACE));
        this.tmpItems.sort(compareFn);
        this.isMovingItems = false;
        return this;
    }
    /**
     * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
     * @param start The zero-based location in the array from which to start removing elements.
     * @param deleteCount The number of elements to remove.
     * @param insertItems Elements to insert into the array in place of the deleted elements.
     */
    splice(start, deleteCount, ...insertItems) {
        const changeTree = this[symbols_1.$changes];
        const itemsLength = this.items.length;
        const tmpItemsLength = this.tmpItems.length;
        const insertCount = insertItems.length;
        // build up-to-date list of indexes, excluding removed values.
        const indexes = [];
        for (let i = 0; i < tmpItemsLength; i++) {
            if (this.deletedIndexes[i] !== true) {
                indexes.push(i);
            }
        }
        if (itemsLength > start) {
            // if deleteCount is not provided, delete all items from start to end
            if (deleteCount === undefined) {
                deleteCount = itemsLength - start;
            }
            //
            // delete operations at correct index
            //
            for (let i = start; i < start + deleteCount; i++) {
                const index = indexes[i];
                changeTree.delete(index, spec_1.OPERATION.DELETE);
                this.deletedIndexes[index] = true;
            }
        }
        else {
            // not enough items to delete
            deleteCount = 0;
        }
        // insert operations
        if (insertCount > 0) {
            if (insertCount > deleteCount) {
                console.error("Inserting more elements than deleting during ArraySchema#splice()");
                throw new Error("ArraySchema#splice(): insertCount must be equal or lower than deleteCount.");
            }
            for (let i = 0; i < insertCount; i++) {
                const addIndex = (indexes[start] ?? itemsLength) + i;
                changeTree.indexedOperation(addIndex, (this.deletedIndexes[addIndex])
                    ? spec_1.OPERATION.DELETE_AND_ADD
                    : spec_1.OPERATION.ADD);
                // set value's parent/root
                insertItems[i][symbols_1.$changes]?.setParent(this, changeTree.root, addIndex);
            }
        }
        //
        // delete exceeding indexes from "allChanges"
        // (prevent .encodeAll() from encoding non-existing items)
        //
        if (deleteCount > insertCount) {
            changeTree.shiftAllChangeIndexes(-(deleteCount - insertCount), indexes[start + insertCount]);
            // debugChangeSet("AFTER SHIFT indexes", changeTree.allChanges);
        }
        //
        // FIXME: this code block is duplicated on ChangeTree
        //
        if (changeTree.filteredChanges !== undefined) {
            changeTree.root?.enqueueChangeTree(changeTree, 'filteredChanges');
        }
        else {
            changeTree.root?.enqueueChangeTree(changeTree, 'changes');
        }
        return this.items.splice(start, deleteCount, ...insertItems);
    }
    /**
     * Inserts new elements at the start of an array.
     * @param items  Elements to insert at the start of the Array.
     */
    unshift(...items) {
        const changeTree = this[symbols_1.$changes];
        // shift indexes
        changeTree.shiftChangeIndexes(items.length);
        // new index
        if (changeTree.isFiltered) {
            (0, ChangeTree_1.setOperationAtIndex)(changeTree.filteredChanges, this.items.length);
            // changeTree.filteredChanges[this.items.length] = OPERATION.ADD;
        }
        else {
            (0, ChangeTree_1.setOperationAtIndex)(changeTree.allChanges, this.items.length);
            // changeTree.allChanges[this.items.length] = OPERATION.ADD;
        }
        // FIXME: should we use OPERATION.MOVE here instead?
        items.forEach((_, index) => {
            changeTree.change(index, spec_1.OPERATION.ADD);
        });
        this.tmpItems.unshift(...items);
        return this.items.unshift(...items);
    }
    /**
     * Returns the index of the first occurrence of a value in an array.
     * @param searchElement The value to locate in the array.
     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
     */
    indexOf(searchElement, fromIndex) {
        return this.items.indexOf(searchElement, fromIndex);
    }
    /**
     * Returns the index of the last occurrence of a specified value in an array.
     * @param searchElement The value to locate in the array.
     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
     */
    lastIndexOf(searchElement, fromIndex = this.length - 1) {
        return this.items.lastIndexOf(searchElement, fromIndex);
    }
    every(callbackfn, thisArg) {
        return this.items.every(callbackfn, thisArg);
    }
    /**
     * Determines whether the specified callback function returns true for any element of an array.
     * @param callbackfn A function that accepts up to three arguments. The some method calls
     * the callbackfn function for each element in the array until the callbackfn returns a value
     * which is coercible to the Boolean value true, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    some(callbackfn, thisArg) {
        return this.items.some(callbackfn, thisArg);
    }
    /**
     * Performs the specified action for each element in an array.
     * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
     * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    forEach(callbackfn, thisArg) {
        return this.items.forEach(callbackfn, thisArg);
    }
    /**
     * Calls a defined callback function on each element of an array, and returns an array that contains the results.
     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    map(callbackfn, thisArg) {
        return this.items.map(callbackfn, thisArg);
    }
    filter(callbackfn, thisArg) {
        return this.items.filter(callbackfn, thisArg);
    }
    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduce(callbackfn, initialValue) {
        return this.items.reduce(callbackfn, initialValue);
    }
    /**
     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduceRight(callbackfn, initialValue) {
        return this.items.reduceRight(callbackfn, initialValue);
    }
    /**
     * Returns the value of the first element in the array where predicate is true, and undefined
     * otherwise.
     * @param predicate find calls predicate once for each element of the array, in ascending
     * order, until it finds one where predicate returns true. If such an element is found, find
     * immediately returns that element value. Otherwise, find returns undefined.
     * @param thisArg If provided, it will be used as the this value for each invocation of
     * predicate. If it is not provided, undefined is used instead.
     */
    find(predicate, thisArg) {
        return this.items.find(predicate, thisArg);
    }
    /**
     * Returns the index of the first element in the array where predicate is true, and -1
     * otherwise.
     * @param predicate find calls predicate once for each element of the array, in ascending
     * order, until it finds one where predicate returns true. If such an element is found,
     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
     * @param thisArg If provided, it will be used as the this value for each invocation of
     * predicate. If it is not provided, undefined is used instead.
     */
    findIndex(predicate, thisArg) {
        return this.items.findIndex(predicate, thisArg);
    }
    /**
     * Returns the this object after filling the section identified by start and end with value
     * @param value value to fill array section with
     * @param start index to start filling the array at. If start is negative, it is treated as
     * length+start where length is the length of the array.
     * @param end index to stop filling the array at. If end is negative, it is treated as
     * length+end.
     */
    fill(value, start, end) {
        //
        // TODO
        //
        throw new Error("ArraySchema#fill() not implemented");
        // this.$items.fill(value, start, end);
        return this;
    }
    /**
     * Returns the this object after copying a section of the array identified by start and end
     * to the same array starting at position target
     * @param target If target is negative, it is treated as length+target where length is the
     * length of the array.
     * @param start If start is negative, it is treated as length+start. If end is negative, it
     * is treated as length+end.
     * @param end If not specified, length of the this object is used as its default value.
     */
    copyWithin(target, start, end) {
        //
        // TODO
        //
        throw new Error("ArraySchema#copyWithin() not implemented");
        return this;
    }
    /**
     * Returns a string representation of an array.
     */
    toString() {
        return this.items.toString();
    }
    /**
     * Returns a string representation of an array. The elements are converted to string using their toLocalString methods.
     */
    toLocaleString() {
        return this.items.toLocaleString();
    }
    ;
    /** Iterator */
    [Symbol.iterator]() {
        return this.items[Symbol.iterator]();
    }
    static get [Symbol.species]() {
        return ArraySchema;
    }
    /**
     * Returns an iterable of key, value pairs for every entry in the array
     */
    entries() { return this.items.entries(); }
    /**
     * Returns an iterable of keys in the array
     */
    keys() { return this.items.keys(); }
    /**
     * Returns an iterable of values in the array
     */
    values() { return this.items.values(); }
    /**
     * Determines whether an array includes a certain element, returning true or false as appropriate.
     * @param searchElement The element to search for.
     * @param fromIndex The position in this array at which to begin searching for searchElement.
     */
    includes(searchElement, fromIndex) {
        return this.items.includes(searchElement, fromIndex);
    }
    //
    // ES2022
    //
    /**
     * Calls a defined callback function on each element of an array. Then, flattens the result into
     * a new array.
     * This is identical to a map followed by flat with depth 1.
     *
     * @param callback A function that accepts up to three arguments. The flatMap method calls the
     * callback function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callback function. If
     * thisArg is omitted, undefined is used as the this value.
     */
    // @ts-ignore
    flatMap(callback, thisArg) {
        // @ts-ignore
        throw new Error("ArraySchema#flatMap() is not supported.");
    }
    /**
     * Returns a new array with all sub-array elements concatenated into it recursively up to the
     * specified depth.
     *
     * @param depth The maximum recursion depth
     */
    // @ts-ignore
    flat(depth) {
        throw new Error("ArraySchema#flat() is not supported.");
    }
    findLast() {
        // @ts-ignore
        return this.items.findLast.apply(this.items, arguments);
    }
    findLastIndex(...args) {
        // @ts-ignore
        return this.items.findLastIndex.apply(this.items, arguments);
    }
    //
    // ES2023
    //
    with(index, value) {
        const copy = this.items.slice();
        // Allow negative indexing from the end
        if (index < 0)
            index += this.length;
        copy[index] = value;
        return new ArraySchema(...copy);
    }
    toReversed() {
        return this.items.slice().reverse();
    }
    toSorted(compareFn) {
        return this.items.slice().sort(compareFn);
    }
    // @ts-ignore
    toSpliced(start, deleteCount, ...items) {
        // @ts-ignore
        return this.items.toSpliced.apply(copy, arguments);
    }
    shuffle() {
        return this.move((_) => {
            let currentIndex = this.items.length;
            while (currentIndex != 0) {
                let randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [this[currentIndex], this[randomIndex]] = [this[randomIndex], this[currentIndex]];
            }
        });
    }
    /**
     * Allows to move items around in the array.
     *
     * Example:
     *     state.cards.move((cards) => {
     *         [cards[4], cards[3]] = [cards[3], cards[4]];
     *         [cards[3], cards[2]] = [cards[2], cards[3]];
     *         [cards[2], cards[0]] = [cards[0], cards[2]];
     *         [cards[1], cards[1]] = [cards[1], cards[1]];
     *         [cards[0], cards[0]] = [cards[0], cards[0]];
     *     })
     *
     * @param cb
     * @returns
     */
    move(cb) {
        this.isMovingItems = true;
        cb(this);
        this.isMovingItems = false;
        return this;
    }
    [(Symbol.unscopables, symbols_1.$getByIndex)](index, isEncodeAll = false) {
        //
        // TODO: avoid unecessary `this.tmpItems` check during decoding.
        //
        //    ENCODING uses `this.tmpItems` (or `this.items` if `isEncodeAll` is true)
        //    DECODING uses `this.items`
        //
        return (isEncodeAll)
            ? this.items[index]
            : this.deletedIndexes[index]
                ? this.items[index]
                : this.tmpItems[index] || this.items[index];
    }
    [symbols_1.$deleteByIndex](index) {
        this.items[index] = undefined;
        this.tmpItems[index] = undefined; // TODO: do not try to get "tmpItems" at decoding time.
    }
    [symbols_1.$onEncodeEnd]() {
        this.tmpItems = this.items.slice();
        this.deletedIndexes = {};
    }
    [symbols_1.$onDecodeEnd]() {
        this.items = this.items.filter((item) => item !== undefined);
        this.tmpItems = this.items.slice(); // TODO: do no use "tmpItems" at decoding time.
    }
    toArray() {
        return this.items.slice(0);
    }
    toJSON() {
        return this.toArray().map((value) => {
            return (typeof (value['toJSON']) === "function")
                ? value['toJSON']()
                : value;
        });
    }
    //
    // Decoding utilities
    //
    clone(isDecoding) {
        let cloned;
        if (isDecoding) {
            cloned = new ArraySchema();
            cloned.push(...this.items);
        }
        else {
            cloned = new ArraySchema(...this.map(item => ((item[symbols_1.$changes])
                ? item.clone()
                : item)));
        }
        return cloned;
    }
    ;
}
exports.ArraySchema = ArraySchema;
(0, registry_1.registerType)("array", { constructor: ArraySchema });
//# sourceMappingURL=ArraySchema.js.map