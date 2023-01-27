//
// Hello, world!
//

#include <stdio.h>

extern "C" void testfunc(void);

int main(void) {
    testfunc();
    printf("HELLO, %s!\n", "WORLD");
    return 0;
}
