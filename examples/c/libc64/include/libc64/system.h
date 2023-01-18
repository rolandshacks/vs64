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

void system_init();

void system_disable_interrupts();
void system_enable_interrupts();

void system_disable_kernal_and_basic();
void system_enable_kernal_and_basic();

void system_read_memory(uint16_t addr);

void system_mem_map(uint8_t bits);

#endif
