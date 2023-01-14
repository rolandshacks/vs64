#include <stddef.h>
#include <stdint.h>

#include "libc64/video.h"
#include "libc64/system.h"

static uint16_t video_vic_base = 0x0;
static uint16_t video_screen_base = 0x400;
static uint16_t video_char_base = 0x1000;
static uint16_t video_bitmap_base = 0x2000;
static uint16_t video_color_base = 0xd800;

static uint8_t char_to_screencode(char c) {

    uint8_t s = (uint8_t) c;
    if (c >= 'A' && c <= 'Z') s = (uint8_t) (1+c-'A');
    else if (c >= 'a' && c <= 'z') return (uint8_t) (1+c-'a');
    else if (c >= '0' && c <= '9') return (uint8_t) (0x30+c-'0');

    return s;
}

void video_init() {

    {
        // set vic memory bank

        // bank 0: bits 11:     0-16383 ($0000-$3FFF)
        // bank 1: bits 10: 16384-32767 ($4000-$7FFF)
        // bank 2: bits 01: 32768-49151 ($8000-$BFFF)
        // bank 3: bits 00: 49152-65535 ($C000-$FFFF)
        uint8_t bank = 2;

        uint8_t flags = peek(0xdd00);
        flags = (flags & 0xfc) | (3 - (bank & 0x03));

        poke(0xdd02, 0b00000011); // enable CIA port A write
        poke(0xdd00, flags); // write bank settings

        video_vic_base = bank * 0x4000;
        video_screen_base = video_vic_base + 0x400;
        video_char_base = video_vic_base + 0x1000;
        video_bitmap_base = video_vic_base + 0x2000;
    }

    {
        // set graphics mode
        uint8_t mode = 0;

        uint8_t flags0 = peek(0xd011)&0x9f;
        uint8_t flags1 = peek(0xd016)&0xef;

        switch (mode) {
            case 0x1: // standard bitmap mode
                flags0 |= 0x20; // bitmap flag
                break;
            case 0x2: // multicolor text mode
                flags1 |= 0x10; // multi-color flag
                break;
            case 0x3: // multicolor bitmap mode
                flags0 |= 0x20; // bitmap flag
                flags1 |= 0x10; // multi-color flag
                break;
            case 0x4: // extended background color mode
                flags0 |= 0x40; // ecm flag
                break;
            default:
                break;
        }

        poke(0xd011, flags0);
        poke(0xd016, flags1);

    }

    {
        // set screen base

        uint8_t base = 0x1;

        uint8_t flags = peek(0xd018) & 0x0f;
        flags |= ((base & 0x0f) << 4); // 4 bits
        poke(0xd018, flags);
        video_screen_base = video_vic_base + base * 0x400;

    }

    {
        // copy charset

        uint8_t base = 1;
        uint8_t* dest = (uint8_t*)(video_vic_base + base * 0x800);
        size_t src_offset = 0;
        size_t count = 0;

        uint8_t oldMemFlags;
        const uint8_t* src;

        system_disable_interrupts();
        oldMemFlags = peek(0x01);
        poke(0x1, oldMemFlags & 0xfb);  // enable access to Character ROM
                                        // instead of mem-mapped I/O at $d000

        src = (const uint8_t*) (0xd000 +  src_offset);

        if (0 == count) count = 0x1000; // default size
        while (count) {
            *(dest++) = *(src++);
            count--;
        }

        poke(0x01, oldMemFlags);

        system_enable_interrupts();

    }

    {
        // set char base

        uint8_t base = 1;

        uint8_t flags = peek(0xd018) & 0xf1;
        flags |= ((base & 0x7) << 1);
        poke(0xd018, flags);
        video_char_base = video_vic_base + base * 0x800;

    }

}

uint8_t* video_get_screen_address(uint8_t col, uint8_t row) {
    uint8_t* addr = (uint8_t*) video_screen_base + (row * 40) + col;
    return addr;
}

void video_clear() {
    video_set_chars(0x20);
}

void video_set_chars(uint8_t c) {
    memset((char*) ((address_t)(video_screen_base)), c, 1000);
}
void video_set_colors(uint8_t col) {
    memset((char*) ((address_t)(video_color_base)), col, 1000);
}

void video_set_background(uint8_t col) {
    poke(0xd021, col);
}

void video_set_border(uint8_t col) {
    poke(0xd020, col);
}

uint16_t video_get_raster_line() {
    return (peek(0xd011) & 0x80 >> 7) | peek(0xd012);
}

void video_wait_next_frame() {
    uint16_t line = video_get_raster_line();
    if (line >= 240) { while (video_get_raster_line() > 80) {}; }
    while (video_get_raster_line() < 240) {};
}

void video_putc(uint8_t x, uint8_t y, char c) {
    address_t ptr = (address_t)(video_screen_base + (y*40+x));
    *ptr = c;
}

void video_putcc(uint8_t x, uint8_t y, char c, uint8_t col) {
    address_t ptr = (address_t)(video_screen_base + (y*40+x));
    address_t ptr_col = (address_t)(video_color_base + (y*40+x));
    *ptr = c;
    *ptr_col = col;
}

void video_puts(uint8_t x, uint8_t y, const char* s, uint8_t col) {
    address_t ptr = (address_t)(video_screen_base + (y*40+x));
    address_t ptr_col = (address_t)(video_color_base + (y*40+x));
    while (*s) {
        *(ptr++) = char_to_screencode(*(s++));
        *(ptr_col++) = col;
    }
}

uint8_t* video_get_vic_base() {
    return (uint8_t*) video_vic_base;
}

uint8_t* video_get_screen_base() {
    return (uint8_t*) video_screen_base;
}

uint8_t* video_get_character_base() {
    return (uint8_t*) video_char_base;
}

uint8_t* video_get_color_base() {
    return (uint8_t*) video_color_base;
}

uint8_t* video_get_bitmap_base() {
    return (uint8_t*) video_bitmap_base;
}

void video_set_scroll_x(uint8_t offset) {
    uint8_t flags = peek(0xd016);
    flags = (flags & 0xf8) | (offset & 0x03);
    poke(0xd01, flags);

}

void video_set_scroll_y(uint8_t offset) {
    uint8_t flags = peek(0xd011);
    flags = (flags & 0xf8) | (offset & 0x03);
    poke(0xd011, flags);
}
