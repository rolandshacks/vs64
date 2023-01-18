#ifndef __LIBC64_SPRITE
#define __LIBC64_SPRITE

#include <stdint.h>
#include <stdbool.h>

void sprite_init();
void sprite_set_enabled(uint8_t sprite, bool enabled);
void sprite_set_mode(uint8_t sprite, bool multicolor);
uint8_t sprite_get_address(const uint8_t* data);
void sprite_set_address(uint8_t sprite, uint8_t block);
void sprite_set_data(uint8_t sprite, const uint8_t* data);
void sprite_set_pos(uint8_t sprite, uint16_t x, uint16_t y);
void sprite_set_color(uint8_t sprite, uint8_t color);
void sprite_set_common_colors(uint8_t color_a, uint8_t color_b);

#endif
