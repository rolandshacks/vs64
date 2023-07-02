# Change Log
All notable changes to the **VS64 Development Environment** extension will be documented in this file.

## 2.4.2 Minor Update

- Improved resource compiler argument handling
- Improved peak RMS loudness normalization for PCM waves
- Improved support for folder with spaces
- Added status bar buttons for build and clean
- Added kickassembler example
- Improved and refactored tests
- Removed eslint warnings
- Bug-fixes and minor improvements

## 2.4.1 Minor Update

- Improved language support for KickAssembler
- Bug-fixes and minor improvements

## 2.4.0 Major Update

- Added support for KickAssembler
- Minor clean-up, enhancements and bug-fixes

## 2.3.5 Minor Update

- Fixed ACME debugger report handling

## 2.3.4 Minor Update

- Added support for PCM wave files in resource compiler
- Added optional resource compiler config section to project file
- Improved ACME language support features
- Minor bug-fixes and improvements

## 2.3.3 Minor Update

- Added project settings for assembler, compiler and linker flags
- Minor bug-fixes

## 2.3.2 Minor Update

- Added code completion for ACME pseudo opcodes
- Improved parsing for ACME language support features
- Minor bug-fixes

## 2.3.1 Minor Update

- Minor bug-fix

## 2.3.0 Major Update

- Added language support features for assembler source files ("Go to Definition", "Go to References")
- Minor clean-up, enhancements and bug-fixes

## 2.2.1 Minor Update

- Minor clean-up, enhancements and bug-fixes

## 2.2.0 Major Update

- Added resource compiler feature
- Minor clean-up, enhancements and bug-fixes

## 2.1.5 Minor Update

- Improved logging and tracing for better problem analysis

## 2.1.4 Minor Update

- Improved handling of executable files

## 2.1.3 Minor Update

- Fixed dependency handling for acme and cc65 toolkits

## 2.1.2 Minor Update

- Improved clang-tidy support
- Minor bug fixes

## 2.1.1 Minor Update

- Added vscode intellisense auto-configuration support
- Minor bug fixes

## 2.1.1 Minor Update

- Added vscode intellisense auto-configuration support
- Minor bug fixes

## 2.1.0 Major Update

- Added elf/dwarf debugging support
- Added ninja based build system
- Improved launch configuration handling
- Improved project creation tools
- Bug fixes

## 2.0.3 Minor Update

- Fixed bug in extension activation when no workspace is open

## 2.0.2 Minor Update

- Fixed rebuild handling

## 2.0.1 Minor Update

- Added support for the LLVM-MOS

## 2.0.0 Major Update

- Support for ACME assembler
- Support for CC65 compiler
- Custom integrated project configuration and build system
- Integration to build, task and launch system
- Launch of C64 programs in integrated 6502 emulation or Vice emulator
- Debugging support for Vice emulator binary monitor protocol
- C64 specific cpu and custom chip debug information
- On-the-fly disassembly of C64 program files
- Problem matcher integration
- Documentation and project examples

## 0.1.14 Minor Update _(preview)_
- Fixed 6502 emulator cycle correctness
  (pull from https://github.com/Torlus/6502.js, thanks to Éric Bissonnette!)

## 0.1.13 Minor Update _(preview)_
- Fixed setting breakpoints
- Fixed handling acme 'serious error' diagnostics
- Improved symbol and label detection
- Added '!word' syntax highlighting
- Show both 8- and 16-bit values of address symbols when their size is unknown

## 0.1.12 Minor Update _(preview)_
- Fixed dependencies

## 0.1.11 Minor Update _(preview)_
- Fixed unexpected closing .asm windows with "invalid arguments" errors in 1.42
- Fixed display of 16-bit watches
- Added support for labels ending with ':'

## 0.1.10 Minor Update _(preview)_
- Added custom command line settings for assembler, emulator and debugger
- Minor fixes
- Security updates

## 0.1.9 Minor Update _(preview)_
- Fixed handling of empty workspace

## 0.1.8 Minor Update _(preview)_
- Security fixes
- Improved relative path handling
- Added settings verification and logging

## 0.1.7 Minor Update _(preview)_
- Added configurable possibility to set initial program counter in debug configurations
- Improved debugger handling of registers
- Minor bug fixes

## 0.1.6 Minor Update _(preview)_
- Added configurable acme assembler search path

## 0.1.5 Minor Update _(preview)_
- Added directory of main source file as default search path for acme assembler
- Improved debugger handling of basic header
- Improved handling of multi-source sessions

## 0.1.4 Minor Update _(preview)_
- Minor bug fixes
- Improved robustness and error handling
- Improved integration of external tools

## 0.1.3 Minor Update _(preview)_
- Minor bug fixes

## 0.1.2 Minor Update _(preview)_
- Minor bug fixes

## 0.1.1 Minor Update _(preview)_
- Minor bug fixes

## 0.1.0 Initial Release _(preview)_
- Initial release
