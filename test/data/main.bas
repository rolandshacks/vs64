#lower

rem "* Hello, World!"

#include "includes/helper.bas"

start:
    print "{CLR}{LOWER}"
    a$ = "{YELLOW}Hello, {GREEN}world!{WHITE}"
    b$ = '{YELLOW}Hello, {GREEN}world!{WHITE}'

main:
    print A$
    print B$
    list
