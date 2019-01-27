# VS64 - The C64 Development Environment

This extension provides support for C64 development in Visual Studio Code.

## Features

* Syntax highlighting for ACME assembler files
* Integration of the ACME assembler
* Full debugging support for MOS 6502 cpu
* Integration of the VICE C64 emulator
* Integration of the C64-Debugger

## Requirements

There are no additional requirements or dependencies to operate this extension.

* For running binaries at a full C64 emulator target, you need to install the VICE C64 emulator.
* For running binaries in a full C64 debugging and monitoring environment, you need to install the C64-Debugger tool.

## Open Source

This package includes open source from other developers and I would like to thank all of those:

* Gregory Estrade - 6502.js: It was great to have your 6502 emulator to form the core of the debugger. Thank you for compressing the 6502 cpu in such a nice piece of software!
* Tony Landi - Acme Cross Assembler (C64): I started with the basic syntax definition for ACME from your package. Thanks for starting that!

## Ideas Taken From

* Captain JiNX - VSCode KickAss (C64)
* Janne Hellsten - c64jasm

## Links

* The ACME Cross-Assembler: https://sourceforge.net/projects/acme-crossass/
* VICE, the Versatile Commodore Emulator: http://vice-emu.sourceforge.net/
* C64 65XE Debugger: https://sourceforge.net/projects/c64-debugger/
* Cycle-accurate 6502 emulator in Javascript: https://github.com/Torlus/6502.js
