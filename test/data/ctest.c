#include <stdlib.h>
#include <string.h> /* for memset */
#include <time.h>
#include <conio.h>
#include <cbm.h>

typedef unsigned char uint8_t;

char helper(char a);

uint8_t myGlobalVariable = 0x33;

void testfn(uint8_t a) {

    uint8_t b = a * 2;
    if (b > 0) b++;

    (*(uint8_t*)(0x1000)) = (uint8_t) b;
}

const uint8_t memblock[4] = { 0x11, 0x22, 0x33, 0x44 };
const uint8_t memblock2[4] = { 0x66, 0x77, 0x88, 0x99 };

int main(void) {
    helper('X');
    testfn(0x88);
    return 0;
}
