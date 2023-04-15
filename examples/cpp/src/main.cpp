//
// Hello, world!
//

#include <stdio.h>

extern "C" void testfunc(void);
extern const unsigned char data[];

extern 

int main(void) {
    testfunc();
    printf("%s\n", data);
    return 0;
}
