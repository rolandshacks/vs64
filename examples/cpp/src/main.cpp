//
// Hello, world!
//

#include <stdio.h>

#include "src/include.h"

extern "C" void testfunc(void);
extern const unsigned char data[];

int main(void) {
    testfunc();
    printf("%s\n", data);
    return 0;
}
