# CC65 Debug File

## Hierarchy

line
    line-number, type
    --> file
    --> span

span
    start, size
    --> seg

scope
    name, size
    --> span
    --> parent
    --> sym
    --> mod

sym
    name, addrsize, def, ref, type, val
    --> scope

csym
    name, type, sc, offs
    --> scope
    --> sym

seg
    name, start, size, addrsize, type, oname, ooffs

mod
    name, file
    --> lib

lib
    name

type
    val

## Graph

digraph G {
    line -> file, span;
    span -> seg;
    scope -> span, scope, sym, mod;
    sym -> scope, type;
    csym -> sym, scope;
    mod -> lib;
    lib type;
    seg -> memory;
}

## Debugger Source Lookup

- Program stops
- Lookup of PC in address info table (addr->span->line)
- Address info contains file and line number
- Editor shows code location

## Debugger C-Symbol Lookup

- Program stops
- Lookup of PC in address info table (addr->span->parent_span->scopes->csymbols)

The debug info is incomplete. It contains the name and stack offset of local symbols and that's it. The type is always "void" and there is no correction for the offset in each span. You can test that using your code and the dbgsh program:

$ dbgsh load test.dbg
File loaded successfully
dbgsh> show csymbol 1 2 3 4
  id  name                        type  kind   sc   offs  symbol scope
---------------------------------------------------------------------------
   1  arg1                           0     1     0     4       -     1
   2  arg2                           0     1     0     2       -     1
   3  arg3                           0     1     0     1       -     1
   4  arg4                           0     1     0     0       -     1
dbgsh> show type 0
  id  description
---------------------------------------------------------------------------
   0  VOID
dbgsh>
