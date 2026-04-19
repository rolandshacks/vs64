//
// Sorted array test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { SortedArray } = require('algorithm/sorted_array');

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

function createArrayItem(value) {
    return {
        value: value
    };
}

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('sorted_array', () => {

test("sorted_array_basics", () => {

    const a = new SortedArray({
        less: (a, b) => {
            return (a.value < b.value);
        },
        key: (a) => {
            return a.value;
        }
    });

    const numItems = 5;
    const stepSize = 10;

    const indices = [];

    const minValue = 0;
    const maxValue = (numItems * stepSize) + stepSize * 2 + 3;
    const midValue = (Math.floor((numItems+1)/2) * stepSize);
    const midValuePos = (Math.floor((numItems+1)/2)-1)*3;

    for (let i=0; i<numItems; i++) {
        const idx = i * stepSize;
        a.push(createArrayItem(idx)); indices.push(idx);
        a.push(createArrayItem(idx + stepSize + 1)); indices.push(idx + stepSize + 1);
        a.push(createArrayItem(idx + stepSize * 2 + 3)); indices.push(idx + stepSize * 2 + 3);
    }

    const arraySize = a.length;
    expect(arraySize).toBe(numItems * 3);

    const arrayElements = a.elements;
    expect(arrayElements.length).toBe(arraySize);

    let errorCount = 0;
    let lastValue = null;
    for (const item of a) {
        const value = item.value;
        if (lastValue != null) {
            if (value < lastValue) {
                errorCount++;
            }
        }
    }

    expect(errorCount).toBe(0);

    errorCount = 0;

    expect(a.indexOf({ value: (minValue-1) })).toBe(-1);
    expect(a.indexOf({ value: (maxValue+1) })).toBe(-1);
    expect(a.indexOf({ value: (midValue) })).toBe(midValuePos);

    let i=0;
    for (const item of arrayElements) {
        const pos = a.indexOf(item);
        if (pos != i) {
            errorCount++;
        }
        i++;
    }

    expect(errorCount).toBe(0);

}); // test

});  // describe
