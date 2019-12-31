# VS64 - The C64 Development Environment

This extension provides support for C64 development in Visual Studio Code.

## Features

* Syntax highlighting for ACME assembler files
* Integration of the ACME assembler
* Full debugging support for MOS 6502 CPU
* Integration of the VICE C64 emulator
* Integration of the C64-Debugger

## Requirements

There are no additional requirements or dependencies to operate this extension.

* For running binaries at a full C64 emulator target, you need to install the VICE C64 emulator.
* For running binaries in a full C64 debugging and monitoring environment, you need to install the C64-Debugger tool.

## Introduction and Basic Usage

The VS64 extension provides a convienient editing, build and run environment. This is done by providing syntax highlighting, automatic background compilation using the ACME assembler, an embedded 6502 CPU emulator and the integration of the VICE C64 emulator and the C64 debugger tool.

### Syntax Highlighting

Support for ACME assember syntax is provided.

### Background Compilation

Whenever a `.asm` source file is modified and saved, it is automatically compiled to a C64 (cbm) `.prg` program file.

If compilation is successful, that program file can either be run/debugged with the embedded debugger based on a defined launch configuration (see *Debugger Launch Configuration*), or it can be loaded into a VICE emulator session or a C64 Debugger session.

If compilation fails, the ACME outputs are shown in the diagnostics view.

### MOS 6502 CPU Emulator

The VS64 extension comes with a built-in 6502 CPU emulator that allows very fast edit-build-run cycles. The limitation is important to understand: it is not a full C64 emulation. It purely executes 6502 machine code as fast as possible - and integrates nicely to the Visual Studio Code debugger interface.

An active 6502 debugging session allows you to:

- define breakpoints
- inspect registers, addresses, values
- get hover information for many elements of the source code

### C64 Emulator Integration

If you have a VICE C64 emulator installed, you can configure the VS64 extension to use it. You trigger the VICE emulator using the `C64: run` command. 

### C64 Debugger Integration

If you have the `C64 Debugger` tool installed, you can configure the VS64 extension to use it. You trigger the VICE emulator using the `C64: debug` command.

Please notice: You have to enable this in your settings.

## Preferences/Settings

To setup the C64 development environment, go to Preferences>Settings and check the following settings:

> C64: Assembler Path

Path to assembler executable.

Example: `C:\Tools\c64\acme\acme.exe`

> C64: Assembler Arguments

Additional assembler command line options.

> C64: Auto Build

Enable auto build before running or debugging.

> C64: Background Build

Enable background build after source changes.

> C64: Debugger Enabled

Flag to enable C64 debugger instead of emulator.

> C64: Debugger Path

Path to C64 debugger executable.

Example: `C:\Tools\c64\C64Debugger\C64Debugger.exe`

> C64: Debugger Arguments

Additional debugger command line options.

> C64: Emulator Path

Path to emulator executable.

Example: `C:\Tools\c64\vice\x64sc.exe`

> C64: Emulator Arguments

Additional emulator command line options.

> C64: Verbose

Flag to enable verbose output of extension

## Debugger Launch Configuration

In order to run a compiled C64 program (`.prg`) using the embedded 6502 CPU emulator, you have to create a launch configuration. Here is a small example:

    {
        "version": "0.2.0",
        "configurations": [
            {
                "type": "asm",
                "request": "launch",
                "name": "Launch Program",
                "pc": "$1000",
                "binary": "C:\\Work\\c64\\demo1\\.cache\\src\\test.prg"
            }
        ]
    }

> `type`: Launch type

Always needs to be "asm".

> `request`: Request type

Always use "launch" here.

> `name`: Launch configuration name

Any name you want to use is fine.

> `binary`: Path to a compiled C64 program

The default build output path is ".cache" within the workspace root folder.

> `pc`: Optional parameter to overwrite the start address of the C64 program

A 16-bit address in decimal or $hexadecimal form.


## Commands

The following extension commands are available to run a compiled program in either a C64 emulator (VICE) or the C64 debugger.

To trigger the commands, just open the **Command Palette** (or just press `Ctrl+Shift+P`) 

> C64: run

Run the output program file (`.prg`) of the currently selected assembler source code (`.asm`) in the configured C64 emulator (VICE).

> C64: debug

If the C64 debugger tool is enabled, run the output program file (`.prg`) of the currently selected assembler source code (`.asm`) in the configured C64 debugger. If not enabled, the command is identical to "C64: run".

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
