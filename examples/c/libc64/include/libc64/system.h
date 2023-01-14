#ifndef __LIBC64_SYS
#define __LIBC64_SYS

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#ifndef MOS_CPU
#define MOS_CPU 1
#endif

typedef uint8_t* address_t;

typedef void (*interrupt_handler_t)(void);


void poke(const uint16_t address, const uint8_t value);
uint8_t peek(const uint16_t address);

void set_bit(const uint16_t address, uint8_t bit, bool enabled);
bool get_bit(const uint16_t address, uint8_t bit);


/*
// Screen constants
#define CONST_Width 320
#define CONST_Height 200
#define CONST_LeftBorder 46
#define CONST_RightBorder 36

// PAL constants
#define CONST_TopBorder 43
#define CONST_BottomBorder 40
#define CONST_TopInvisible 7
#define CONST_BottomInvisible 13
#define CONST_RasterLines 312
#define CONST_CyclesPerLine 63
#define CONST_FirstVBlankLine 300
#define CONST_LastVBlankLine 15

// NTSC constants
#define CONST_NtscRasterLines 263
#define CONST_NtscCyclesPerLine 65
#define CONST_NtscFirstVBlankLine 13
#define CONST_NtscLastVBlankLine 40

// Device constants
#define CONST_BorderColorRegister 0xd020
#define CONST_BackgroundColorRegister 0xd021
#define CONST_ColorRAM 0xd800 // ..0xdbe7

// System constants
#define CONST_KERNAL_IRQ 0x0314
#define CONST_HARDWARE_IRQ 0xfffe
*/

void system_init();

void system_disable_interrupts();
void system_enable_interrupts();

void system_disable_kernal_and_basic();
void system_enable_kernal_and_basic();

void system_read_memory(uint16_t addr);

void system_mem_map(uint8_t bits);

#endif
