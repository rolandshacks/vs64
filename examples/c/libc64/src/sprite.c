#include <stddef.h>
#include <stdint.h>

#include "libc64/sprite.h"
#include "libc64/video.h"
#include "libc64/system.h"

extern uint8_t __sprite_data[][64];
extern size_t __sprite_data_size;

void sprite_init() {
    const uint8_t* src = __sprite_data[0];
    const size_t sz = __sprite_data_size;
    uint8_t* dst = (uint8_t*) (0x8000);
    memcpy(dst, src, sz);
}

void sprite_set_enabled(uint8_t sprite, bool enabled) {
    set_bit(0xd015, sprite, enabled);
}

void sprite_set_mode(uint8_t sprite, bool multicolor) {
    set_bit(0xd01c, sprite, multicolor);
}

uint8_t sprite_get_address(const uint8_t* data) {
    uint8_t block;
    if (NULL == data) data = __sprite_data[0];
    block = (uint8_t) (((uint16_t) (data) - (uint16_t) video_get_vic_base()) / 64);
    return block;
}

void sprite_set_address(uint8_t sprite, uint8_t block) {
    poke((uint16_t) video_get_screen_base() + 0x03f8 + sprite, block);
}

void sprite_set_data(uint8_t sprite, const uint8_t* data) {
    sprite_set_address(sprite, sprite_get_address(data));
}

void sprite_set_pos(uint8_t sprite, uint16_t x, uint16_t y) {
    uint16_t addr = 0xd000 + sprite*2;
    poke(addr, x&0xff);
    poke(addr+1, y&0xff);
    set_bit(0xd010, sprite, (x&0xff00)!=0x0);
}

void sprite_set_color(uint8_t sprite, uint8_t color) {
    poke(0xd027 + sprite, color);
}

void sprite_set_common_colors(uint8_t color_a, uint8_t color_b) {
    poke(0xd025, color_a);
    poke(0xd026, color_b);
}
