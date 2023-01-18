#ifndef __LIBC64_VIDEO
#define __LIBC64_VIDEO

#include <stdint.h>
#include <string.h>

void video_init();
void video_clear();

void video_set_chars(uint8_t c);
void video_set_colors(uint8_t col);

void video_set_background(uint8_t col);
void video_set_border(uint8_t col);
void video_wait_next_frame();

void video_putc(uint8_t x, uint8_t y, char c);
void video_putcc(uint8_t x, uint8_t y, char c, uint8_t col);
void video_puts(uint8_t x, uint8_t y, const char* s, uint8_t col);

uint8_t* video_get_vic_base();
uint8_t* video_get_screen_base();
uint8_t* video_get_character_base();
uint8_t* video_get_color_base();
uint8_t* video_get_bitmap_base();

uint8_t* video_get_screen_address(uint8_t col, uint8_t row);

uint16_t video_get_raster_line();

void video_set_scroll_x(uint8_t offset);
void video_set_scroll_y(uint8_t offset);

#endif
