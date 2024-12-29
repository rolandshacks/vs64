[![Version](https://img.shields.io/visual-studio-marketplace/v/rosc.vs64)](https://marketplace.visualstudio.com/items?itemName=rosc.vs64) [![Installs](https://img.shields.io/visual-studio-marketplace/i/rosc.vs64)](https://marketplace.visualstudio.com/items?itemName=rosc.vs64) [![Build Status](https://dev.azure.com/ms-azuretools/AzCode/_apis/build/status/Nightly/vscode-docker-nightly-2?branchName=main)](https://dev.azure.com/ms-azuretools/AzCode/_build/latest?definitionId=22&branchName=main)

# VS64 - The C64 Development Environment

[VS64](https://github.com/rolandshacks/vs64) is an open-source extension for [Visual Studio Code](https://code.visualstudio.com).

The VS64 extension makes it easy to develop software for the C64 using Visual Studio Code. It provides in-depth support for 6502 assemblers, C and C++ compilers and the BASIC programming language. It comes with a project and build system, compilers and converters for BASIC and resource files, and it integrates well with all the advanced features of Visual Studio Code, such as the task and launch system, debugging and introspection and language grammar and semantics support.

<p align="center">
  <img src="./resources/walkthroughs/welcome.png" alt="" />
</p>

## Features and Supported Languages/Toolkits

* ACME assembler
* KickAssembler
* LLVM-MOS C/C++
* CC65 C-compiler
* Oscar64 C-compiler
* BASIC V2 and Tuned Simon's BASIC
* Meta-build system based on the Ninja build toolkit
* Integrated project setup and configuration
* Task and build system integration to vscode
* Resource compiler for sprites, charsets, tiles, maps, bitmaps, music and binary blobs (SpritePad/Pro, CharPad/Pro, SpriteMate, Koala Paint, PNG, SID, PCM Wave)
* BASIC to PRG compiler and debugger (original BASIC V2 and Tuned Simons Basic NEO "TSBneo")
* Syntax highlighting for assembler and BASIC files
* Debugging and launch support for integrated 6502 emulation
* Debugging and launch support for the VICE emulator using the binary monitor protocol
* Launch support for the X16 emulator
* Integrated MOS 6502 cpu emulation, support for C64 memory model and startup behavior
* Extended introspection for 6502 cpu states, C64 custom chips state information and memory contents
* Direct access to D64 disks as virtual workspace folders
* On-the-fly disassembly of C64 program files for assembly and BASIC code

## Quick and Start (TL;DR)

### Getting Started

The quickest start is by opening the command palette and run the **"VS64: Getting Started"** command.

If you want to do some manual steps or adjustments, these are the individual things to look at:

* Install your assemblers and/or compilers
* Install the VICE emulator
* Adjust your VS64 settings
* Run "VS64: Create Project" from the command palette
* Auto-compile should pick up the newly created project and build everything
* Debug configurations should be ready to run on the internal CPU emulator or VICE

### Creating Projects Quickly

The "Create Project" commands are a great tool to configure and re-configure a code project. Whenever such a command is issued, the current workspace will be scanned and a fresh project configuration file will be generated based on the existing source files. Afterwards, everything should be ready to build and run.

## Setup

### ACME Cross-Assembler

VS64 supports the ACME Cross-Assembler.

* Manual installation: Download and install from https://sourceforge.net/projects/acme-crossass
* Use a package management system, for example on Ubuntu/Debian: `sudo apt install acme`

In case you did a manual or custom installation, please make sure you updated the VS64 settings with the correct ACME installation path.

### Kick Assembler

VS64 supports Kick Assembler.

* Installation: Download and install from http://theweb.dk/KickAssembler
* Also, make sure you have a working Java Runtime. Download and install from https://openjdk.org

Please make sure you check the VS64 settings for the correct KickAssembler installation path.

### LLVM-MOS Compiler

VS64 also supports the LLVM-MOS C/C++ Compiler.

* Installation: Download and install from https://github.com/llvm-mos/llvm-mos-sdk

Please make sure you update the VS64 settings with the correct LLVM-MOS installation and include paths.

### CC65 Compiler

VS64 also supports the CC65 6502 C Compiler.

* Manual installation: Download and install from https://cc65.github.io
* Use a package management system, for example on Ubuntu/Debian: `sudo apt install cc65`

In case you did a manual or custom installation, please make sure you update the VS64 settings with the correct CC65 installation and include paths.

### Oscar64 Compiler

VS64 also supports the Oscar64 C Compiler.

* Manual installation: Download and install from https://github.com/drmortalwombat/oscar64

In case you did a customized installation, please make sure you update the VS64 settings with the correct Oscar65 installation and include paths.

### BASIC Compiler

VS64 supports compiling BASIC source to binary programs.

* No installation needed.
* Support for original BASIC V2
* Tuned Simon's BASIC (TSBneo)
* Support for code crunching

In order to use the basic compiler, just add your BASIC source files to the "sources" list of the project file.

### Crunching BASIC Code

The basic compiler supports crunching of BASIC code:

* Removal of spaces
* Line number re-ordering
* Removal of REM statements

To enable this feature, just set the build mode in the project file to "release":

```
"build": "release"
```

### Upper/Lower Case Character Set

In order to properly use the different ROM character sets in BASIC programs, remapping of upper/lower case character codes is needed. This can be achieved in two different ways:

- opening the settings and specify the default charset the for the BASIC compiler and de-compiler to be either `big/graphics` for the character set 1 (default), or `small/big` for the character set 2.
- adding the build flag `--lower` to toggle between upper and lower case characters, which will override the default settings.
- using the preprocessor directives `#lowercase` (aliases are `#lower` and `#cset1`) or `#uppercase` (aliases are `#upper` and `#cset0`), which will override both project settings as well as workspace settings.

> **Info**: Use `POKE 53272,23` or `PRINT "{lower}"` to actually switch to the upper/lower case charset, and use `POKE 53272,21` or `PRINT "{upper}"` to switch back to the default charset.

Example of properly using the upper/lower case character set in source code:

```
#lowercase
10 print "{lower}"
20 rem "* AaBbZz *"
30 print "AaBbZz"
```

Example of BASIC compiler flags in the project file instead of the `#lowercase` preprocessor directive:

```
"args": ["--lower"]
```

#### Raw Strings

In order to use characters without upper/lower case conversion, use single quoted raw strings:

```
#uppercase
10 PRINT "{upper}"
20 PRINT "HELLO"
30 PRINT 'Hello'
```

#### Auto-Numbering

The compiler adds line numbers automatically. In case a basic line does not contain a line number, it uses 'last number + 1'. Whenever static line numbers are given in the source code, automatic counters continue from there.

For example:

```
10 A$="HELLO"
PRINT A$
50 B$="WORLD"
PRINT B$
```

Will be compiled to:

```
10 A$="HELLO"
11 PRINT A$
50 B$="WORLD"
51 PRINT B$
```

#### Use of Labels

In addition to using line numbers as jump targets, the basic compiler also lets you use labels.

Here's one example:

```
label1:
    A$="HELLO"
    PRINT A$
    GOTO label1
```

Will be compiled to:

```
1 A$="HELLO"
2 PRINT A$
3 GOTO 1
```

#### PETSCII Control Characters

The usage of PETSCII control characters is supported via the extended string control character syntax:

```
PRINT "{clr}HELLO, {green}WORLD{$21}{lightblue}"
```

A control token within a string is either a {mnemonic}, {number}, {$hex}, {0xhex}, {%binary} or {0bbinary}.

> **The following mnemonics are available**:
{space}, {return}, {shift-return}, {clr}, {clear}, {home}, {del}, {inst}, {run/stop},
{cursor right}, {crsr right}, {cursor left}, {crsr left}, {cursor down}, {crsr down}, {cursor up}, {crsr dup},
{uppercase}, {upper}, {cset1}, {lowercase}, {lower}, {cset0},
{black}, {blk}, {white}, {wht}, {red}, {cyan}, {cyn}, {purple}, {pur}, {green}, {grn}, {blue}, {blu}, {yellow}, {yel}, {orange}, {brown}, {pink}, {light-red}, {gray1}, {darkgrey}, {grey}, {lightgreen}, {lightblue}, {grey3}, {lightgrey}, {rvs on}, {rvs off},
{f1}, {f3}, {f5}, {f7}, {f2}, {f4}, {f6}, {f8},
{ctrl-c}, {ctrl-e}, {ctrl-h}, {ctrl-i}, {ctrl-m}, {ctrl-n}, {ctrl-r}, {ctrl-s}, {ctrl-t}, {ctrl-q},
{ctrl-1}, {ctrl-2}, {ctrl-3}, {ctrl-4}, {ctrl-5}, {ctrl-6}, {ctrl-7}, {ctrl-8}, {ctrl-9}, {ctrl-0}, {ctrl-/},
{c=1}, {c=2}, {c=3}, {c=4}, {c=5}, {c=6}, {c=7}, {c=8}

In addition, additional control codes as seen in Compute! magazine are supported.  This includes repeating control codes of the format `{count code}`.  For example, `{12 right}`.  Compute! also supported a number of other aliases for the control codes shown above that are supported including:

>{down}, {right}, {spaces}, {up}, {left}, {shift-space}, {rvs}, {off}

### Resource Compilation

VS64 comes with an integrated resource compiler that turns media files into plain source code to be directly referenced by the code and compiled into the binary. Currently, the supported media formats are:

* SpritePadPro and SpritePad 1.8.1 file format (.spd)
* CharPad64Pro file format (.ctm)
* SpriteMate file format (.spm)
* SID file format (.sid)
* Raw binary data (.raw)

In order to use the resource compiler, just add your resources files to the "sources" list of the project file.

> **Please notice:** The resource compiler requires a Python 3.x interpreter to be used. On Windows, the VS64 extension is providing a minimalistic fallback setup out of the box, while on Linux and MacOS, it is assumed that Python is already installed and running just fine.

### VICE Emulator

In addition to the internal 6502 cpu emulator, VS64 also supports debugging using the VICE emulator.

* Manual installation: Download and install from https://vice-emu.sourceforge.io
* Use a package management system, for example on Ubuntu/Debian: `sudo apt install vice`

In case you did a manual or custom installation, please make sure you update the VS64 settings with the correct VICE executable.

> **Please notice:** It is recommended to use or upgrade to version 3.7 of VICE as with this version, the binary monitor interface has been declared stable.

### Commander X16 Emulator

VS64 provides launch integration for the Commander X16 emulator.

* Manual installation: Download and install from https://github.com/X16Community/x16-emulator

Please make sure you update the VS64 settings with the correct x16emu executable.


## General Usage

The VS64 extension provides a convienient editing, build and run environment. This is done by providing syntax highlighting, seamless integration to the task, build and launch system, an embedded 6502 CPU emulator for fast and precise evaluation of 6502 code and integration of the VICE C64 emulator for advanced system debugging. For further analysis, an integrated disassembler and BASIC-decompiler for C64 program files is provided.

For details, please look at the provided example projects for ACME, LLVM-MOS, CC65 or BASIC.

### Build System

VS64 provides a meta build system which is based on the Ninja build toolkit. Dependency scanning and the generation of intellisense information is supported.

### Syntax Highlighting

Support for ACME assember syntax is provided. Syntax highlighting for KickAssembler is partially implemented. The recommended file extension is `.asm`.

### Project Configuration

The VS64 extension is mainly controlled and configured using a per-workspace project configuration file `project-config.json`. The project config file needs to reside in the root folder of the project and needs to be in JSON format.

The general structure of the file is like this:

```
{
    "name": "example",
    "description": "Example project",
    "toolkit": "acme",
    "main": "src/main.asm",
    "build": "release",
    "definitions": [],
    "includes": ["src/includes"]
}
```

A more extensive project file for CC65 using source and resource files could like like this:

```
{
    "name": "cexample",
    "description": "Example for the CC65 compiler",
    "toolkit": "cc65",
    "sources": [
        "src/main.c",
        "libc64/src/audio.c",
        "libc64/src/auxiliary.c",
        "libc64/src/system.c",
        "libc64/src/video.c",
        "libc64/src/sprite.c",
        "resources/sprites.spm"
    ],
    "build": "debug",
    "definitions": [],
    "includes": ["libc64/include"]
}
```

A project file for CC65 could like like this:

```
{
    "name": "cppexample",
    "description": "Example for the LLVM-MOS sdk",
    "toolkit": "llvm",
    "machine": "c64",
    "sources": [
        "src/assem.asm",
        "src/main.cpp"
    ],
    "build": "debug",
    "definitions": [],
    "includes": [],
    "args": [],
    "assemblerFlags": "",
    "compilerFlags": "",
    "linkerFlags": "",
    "compiler": "",
    "resources: {}
}
```

To specify resource compiler flags and options, add a section `"resources"` to
the project file using the following syntax:

```
{
    "name": "example",
    ...
    "resources": {
        "sampleFrequency": 8000,
        "sampleBits": 8
    },
    ...
}
```

A project file for a BASIC program could look like this:

```
{
    "name": "basic_example",
    "description": "Example for BASIC",
    "toolkit": "basic",
    "sources": [
        "src/main.bas"
    ],
    "args": ["--lower"]
    ...
}
```

Example project file to use C++ for the Commander X16:

```
{
    "name": "x16",
    "description": "Project x16",
    "toolkit": "llvm",
    "sources": [
        "src/main.cpp"
    ],
    "build": "debug",
    "definitions": [],
    "includes": [],
    "args": [],
    "compiler": "",
    "machine": "cx16"
    ...
}
```

> name

Project name, also defines the name of the output program file `name.prg`.

> description

Project description, for information purposes.

> sources

Defines all used source and resource files. The build system will keep track of changes of these files. Resources files will be translated to language-specific to binary data declarations.

> toolkit

Specifies which build toolkit is used. Currently supported are `"acme"`, `"kick"`, `"llvm"`, `"cc65"`, `"oscar64"` and `"basic"`.

> machine

Specifies the target system which the binaries should be generated for. Default is the C64, possible settings are dependent on the used toolkit.

- For ACME, this is equivalent to the `"--cpu"` command line setting. Currently available are: 6502, nmos6502, 6510, 65c02, r65c02, w65c02, 65816, 65ce02, 4502, m65, c64dtv2.

- For LLVM, this is used to specify the configuration file. For example: machine "c64" would result in the command line flags "--config mos-c64.cfg". Currently available are: atari2600-4k, atari2600-3e, atari8, atari8-stdcart, c128, c64, vic20, cx16, pet, mega65, cpm65, nes, nes-action53, nes-cnrom, nes-gtrom, nes-mmc1, nes-mmc3, nes-nrom, nes-unrom, nes-unrom-512, osi-c1p, dodo, eater, pce, pce-cd, rpc8e, sim,

- For CC65, this is equivalent to the `"-t"` command line setting. Currently available are: apple2, apple2enh, atari, atarixl, atmos, c16, c64, c128, cbm510, cbm610, geos-apple, geos-cbm, lunix, lynx, nes, osic1p, pet, plus4, sim6502, sim65c02, supervision, telestrat, vic20

- For BASIC, this setting is ignored.

> main

Can be used instead of 'sources' in simple projects. Defines the main source file which is compiled and used as the entry point for recursive dependency scanning.

> build

Defines either a `"release"` or `"debug"` build. Debug builds are the default if not specified.

> definitions

Optional project specific compiler defines. The project defines are added to the global defines as specified in the settings.

> includes

Optional project include paths for the compiler. The project specific include paths are added and overlay the global include paths specified in the settings.

> args

Optional argument list to be added to the build tool command line arguments. For more fine grained setting, use the 'assemblerFlags', 'compilerFlags' and 'linkerFlags'
attributes.

> assemblerFlags

Optional arguments to be added to the assembler command.

> compilerFlags

Optional arguments to be added to the compiler command.

> linkerFlags

Optional arguments to be added to the linker command.

Example to use a specific linker configuration for cc65:

```
"linkerFlags": [
    "--config", "c64.cfg"
]
```

> compiler

Overrides the path to the compiler executable. The default path is specified in the settings.

> resources

Optional parameters for the resource compiler. Currently, the following list of parameters is supported:
- **sampleFrequency** (WAV) : resampling target frequency for the PCM wave form compiler (e.g. 4000 or 8000, default is 4000 Hz)
- **sampleBits** (WAV) : target samples per bit for the PCM wave form compiler (can be 4 or 8, default is 4 bits/sample)
- **sampleLoudness** (WAV) : target RMS loudness in dB for sample output (e.g. -9.0)
- **sampleNormalizationMax** (WAV) : maximum normalization factor for sample output (e.g. 5.0)
- **bitmapWidth** (PNG) : scale PNG bitmaps to target size (e.g. scale larger bitmap to 160 pixels or less width, must be multiples of 4 pixels)
- **bitmapHeight**  (PNG) : scale PNG bitmaps to (e.g. scale larger bitmap to 200 pixels or less height, must be multiples of 8 pixels)
- **bitmapDithering** (PNG) : enable dithering for PNG bitmaps during color palette reduction (default is 'false')

Example:

```
"resources": {
    "sampleFrequency": 8000,
    "sampleBits": 8,
    "sampleLoudness": -9.0,
    "sampleNormalizationMax": 5.0
}
```

>rcFlags

Optional arguments to be added to the resource compiler command. Use this to force the resource compiler to produce a specific output format, where format can be `'cpp'`, `'cc'`, `'acme'` or `'kick'`.

```
{
    ...
    "rcFlags": "--format cpp"
}
```

### Disassembler and BASIC De-Compiler

VS64 supports on-the-fly disassembly of .prg files containing either machine code or BASIC programs.
In order to use it, just open a `.prg` file in the Visual Studio Code editor.

### D64 File System Provider

VS64 allows mounting D64 files as virtual folders of the Visual Studio Code workspace tree.

To add a D64 file to the workspace, simply select a .d64 disk file, then right-click and select "Mount".
In case the disk was successfully opened, there should be a new folder at the root level of the project workspace.

In order to unmount a virtual D64 folder, simple select the workspace folder and choose "Remove from workspace".

Supported actions:

- Open and edit files
- Copy files to and from disk
- Delete files
- Rename files

Some additional notes:

- Be careful about what you do, you will actually modify your D64 file
- To create a new disk, just create a new .d64 file and mount it. VS64 will automatically create, format and mount the disk file.

### IntelliSense Support

The VS64 build system supports the [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense) editing features of Visual Studio Code. Project settings, include paths and defines are automatically provided to the IntelliSense system.

Further information about IntelliSense can be found [here](https://code.visualstudio.com/docs/cpp/cpp-ide).

### Background Compilation

Whenever a referenced source file or the project settings file is modified and saved, it is automatically compiled to a C64 (cbm) `.prg` program file.

If compilation is successful, that program file can either be run/debugged with the embedded debugger based on a defined launch configuration (see *Debugger Launch Configuration*), or it can be loaded into a VICE emulator session to run an advanced debugging session.

If compilation fails, the ACME outputs are shown in the problems view as well as in the output terminal view.

## Debugging

### Debugging Features

The VS64 extension comes with a built-in 6502 CPU emulator that allows very fast edit-build-run cycles. The limitation is important to understand: it is not a full C64 emulation. It executes 6502 machine code as fast as possible - and integrates nicely to the Visual Studio Code debugger interface. But it does not emulate any of the C64 custom chips (the VIC, SID, CIA, etc.). To still run C64 code similar to what would happen on a real C64, the bank switching and handling of ROM memory areas is supported. Also, basic startup behavior is supported in a way that actual C64 program files can be loaded and executed.

As another option for debugging, a VICE emulator session can be launched or attached to perform advanced debugging steps in an acurate C64 system emulation.

Supported debugging features:

- Run, pause, step in, step out, step over, stop, restart
- Define and clear breakpoints
- Inspect registers, addresses, values
- Inspect C64 specific chip registers (VIC, SID, CIA)
- Get hover information for many elements of the source code

Debugging support for the CC65 toolkit

- Source level debugging
- Resolve global symbol table
- Type information is not provided

Debugging support for the LLVM Toolkit (Elf/Dwarf):

- Source level debugging
- Resolve global symbol table
- General debug and type information are not handled, yet

Debugging support for the BASIC Toolkit:
- Source level debugging
- Resolving variables (integers, real, strings) and arrays
- BASIC interpreter states, registers and counters

> **Please notice:** Debugging with a release build can be quite challenging. In order to enable correct behavior, use a `"debug"` build for debugging sessions (by setting the flag in the project configuration).

### Debugger Launch Configuration

In order to debug a compiled C64 program (`.prg`) you have to create a launch configuration. Here are a few examples:

```
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "6502",
            "request": "launch",
            "name": "Launch 6502",
            "preLaunchTask": "${defaultBuildTask}"
        },
        {
            "type": "vice",
            "request": "launch",
            "name": "Launch Vice",
            "preLaunchTask": "${defaultBuildTask}"
        },
        {
            "type": "vice",
            "request": "attach",
            "name": "Attach Vice",
            "hostname": "localhost",
            "port": 6502,
            "preLaunchTask": "${defaultBuildTask}"
        },
        {
            "type": "x16",
            "request": "launch",
            "name": "Launch X16",
            "preLaunchTask": "${defaultBuildTask}"
        },
    ]
}
```

> `type`: Launch type

Can be either "6502" to run the integrated 6502 cpu emulator, "vice" to run a VICE emulator based debugging session or "x16"
to launch the Commander X16 emulator.

> `request`: Request type

Use "launch" here to run a new emulation session. In case "vice" is selected as debugger type, then a new VICE process is started.
Use "attach" to attach to a running VICE process. VICE needs to have the binary monitor interface enabled, or has to be started with the `-binarymonitor` and `-autostartprgmode 1` command line arguments.

> `name`: Launch configuration name

Any name you want to use is fine.

> `hostname`: Host name

Optional name of host running a VICE emulator with enabled binary monitor. If not specified, 'localhost' will be used.

> `port`: Port number

Optional port number of running a VICE emulator with enabled binary monitor. If not specified, the binary monitor default port '6502' will be used.

> `pc`: (6502 only) Optional parameter to overwrite the start address of the C64 program. Default is taken from the first two bytes of the program file.

A 16-bit address in decimal or $hexadecimal form.

> `preLaunchTask`: Task to be executed before launch

Optional task name, can be `${defaultBuildTask}` to use the currently configured default build task.

### Debugger Watch Expressions

The debugger supports different kinds of watch expressions: registers, constant values and addresses. Here are a few examples for direct, symbolic and indirect watch expressions:

- `addr0` : displays the byte value which the label 'addr0' points at.

- `addr0,w` : displays the word value which the label 'addr0' points at.

- `addr0,8` : shows a hex dump of 8 bytes starting at the address of label 'addr0'.

- `addr0+2*16,8` : shows a hex dump of 8 bytes starting at a computed address.

- `y` : shows the value of the Y register

- `$8400` : shows the data at memory address $8400

- `$8400,3` : shows 3 bytes at memory address $8400

- `$9e2,iw` : use indirect address from $9e2 to display a data word

- `strref,i8` : use indirect address from pointer strref to display 8 data bytes

## Preferences/Settings Reference

To setup the C64 development environment, go to *Preferences>Settings* to open the settings window.

### Build System Settings

> VS64: Acme Install Dir

Path to Acme installation. Example: `C:\Tools\c64\acme`.

> VS64: KickAssembler Install Dir

Path to KickAssembler installation. Example: `C:\Tools\c64\kickassembler`.

> VS64: Cc65 Install Dir

Path to Cc65 installation. Example: `C:\Tools\c64\cc65`.

> VS64: LLVM Install Dir

Path to LLVM-MOS installation. Example: `C:\Tools\c64\llvm-mos`.

> VS64: Build Defines

Global build defines.

> VS64: Build Includes

Global build include paths.

> VS64: Build Args

Global build command line options.

> VS64: Ninja Executable

Path to custom Ninja build executable. Example: `C:\Tools\bin\ninja.exe`.
Leave blank to use the embedded Ninja executable that is distributed with the extension.

> VS64: Python Executable

Path to custom Python installation. Example: `C:\Tools\python\python.exe`.
Leave blank to use an installed Python environment or (on Windows) use the minimalistic Python environment distributed with the extension.

> VS64: Java Executable

Path to Java executable. Example: `C:\Tools\jdk\bin\java`.
Leave blank to use an installed Java Runtime / JDK environment.

> VS64: Basic Compiler

Path to a Python script to be used as a drop-in replacement for the VS64 BASIC compiler (bc.py).

> VS64: Resource Compiler

Path to a Python script to be used as a drop-in replacement for the VS64 resource compiler (rc.py).

> VS64: Auto Build

Enable auto build before running or debugging.

### Emulator Settings

> VS64: VICE Executable

Path to Vice emulator executable. Example: `C:\Tools\c64\vice\bin\x64sc.exe`.

> VS64: VICE Arguments

Additional VICE emulator command line options.

> VS64: VICE Port

Port number to use to connect to the VICE emulator debug interface (6502 is the default).

> VS64: X16 Executable

Path to X16 emulator executable. Example: `C:\Tools\x16emu\x16emu.exe`.

> VS64: X16 Arguments

Additional X16 emulator command line options.

### Misc Settings

> VS64: Log Level

Set console output verbosity level (error, warn, info, debug, trace).

> VS64: BASIC Charset

Set default charset for the BASIC compiler and disassembler ("big/graphics" for character set 1, or "small/big" for character set 2).

> VS64: Recursive Label Parsing

Can be used to disable recursive parsing of assembly files. Mostly used for
debugging purposes. Default and recommendation is to leave it enabled.

> VS64: Show Welcome

Enable the welcome page. This setting is automatically disabled after the welcome page has been shown.

## Open Source

This package includes open source from other developers and I would like to thank all of those:

* Ninja build: Using the ninja build toolkit as the foundation for the VS64 meta build system was a great experience. Thank you for that excellent tool!
* Gregory Estrade - 6502.js: It was great to have your 6502 emulator to form the core of the debugger. Thank you for compressing the 6502 cpu in such a nice piece of software!
* Tony Landi - Acme Cross Assembler (C64): I started with the basic syntax definition for ACME from your package. Thanks for starting that!
* The VICE emulator team.

## Links

* The ACME Cross-Assembler: https://sourceforge.net/projects/acme-crossass
* The Kick Assembler: http://theweb.dk/KickAssembler
* LLVM-MOS: https://github.com/llvm-mos/llvm-mos-sdk
* CC65 C-Compiler: https://cc65.github.io
* Oscar64 C-Compiler: https://github.com/drmortalwombat/oscar64
* VICE, the Versatile Commodore Emulator: http://vice-emu.sourceforge.net
* Ninja build system: https://ninja-build.org
* Cycle-accurate 6502 emulator in Javascript: https://github.com/Torlus/6502.js
* Tuned Simon's BASIC: https://github.com/godot64/TSB
* Example of vscode debugging extension: https://github.com/microsoft/vscode-mock-debug
* SpritePad C64 Pro: https://subchristsoftware.itch.io/spritepad-c64-pro
* CharPad C64 Pro: https://subchristsoftware.itch.io/charpad-c64-pro
* SpriteMate: https://www.spritemate.com
* GoatTracker2: https://sourceforge.net/projects/goattracker2
* Commander X16 Emulator: https://github.com/X16Community/x16-emulator
