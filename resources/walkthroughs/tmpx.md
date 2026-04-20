# Turbo Macro Pro X Cross-Assembler

The Turbo Macro Pro X Cross-Assembler is a new addition to the VS64 IDE.
It is fully compatible with Macro Pro from 2006, but also includes modernizing features like binary file includes that are only available when cross compiling.

## Working with multiple .asm source files

The cross compiler takes a single source file as input.  
If the project contains multiple source file set the `main`-property in file `project-config.json` to the main source file.  

## Setting the working directory for the tmpx

Set the `cwd`-property in file `project-config.json` to the directory where `tmpx` should be launched.
