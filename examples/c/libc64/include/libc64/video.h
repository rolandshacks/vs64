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


/*
enum class GraphicsMode {
    StandardTextMode = 0x0,
    StandardBitmapMode = 0x1,
    MulticolorTextMode = 0x2,
    MulticolorBitmapMode = 0x3,
    ExtendedBackgroundColorMode = 0x4,
    IdleMode = 0x5
};

struct video_metrics_t {
    bool is_pal {true};
    uint16_t num_raster_lines{};
    uint8_t frames_per_second{};
    uint8_t millis_per_frame{};
};

struct video_stats_t {
    uint16_t frame_counter{0};
    uint16_t time_seconds{0};
    uint16_t time_millis{0};
    uint16_t time_delta{0};
    uint16_t time_micro_err{0};
};

struct video_raster_step_t {
    uint16_t line{0xffff};
    interrupt_handler_t fn{nullptr};
};

        static void video_init() noexcept;
        static void video_setGraphicsMode(uint8_t mode) noexcept;
        static void video_setBank(uint8_t bank) noexcept;
        static void video_setScreenBase(uint8_t base) noexcept;
        static void video_setBitmapBase(uint8_t base) noexcept;
        static void video_setCharacterBase(uint8_t base) noexcept;
        static volatile uint8_t* video_getBasePtr() noexcept { return (address_t)(vic_base); };
        static volatile uint8_t* video_getScreenBasePtr() noexcept { return (address_t)(screen_base); };
        static volatile uint8_t* video_getColorBasePtr() noexcept { return (address_t)(color_base); };
        static volatile uint8_t* video_getBitmapBasePtr() noexcept { return (address_t)(bitmap_base); };
        static volatile uint8_t* video_getCharacterBasePtr() noexcept { return (address_t)(char_base); };
        static volatile uint8_t* video_getCharacterBasePtr(uint8_t base) noexcept { return (address_t)(vic_base + base * 0x800); };

        static void video_setScrollX(uint8_t offset) noexcept;
        static void video_setScrollY(uint8_t offset) noexcept;

        static void video_setSpriteEnabled(uint8_t sprite, bool enabled) noexcept;
        static void video_setSpriteData(uint8_t sprite, const uint8_t* data) noexcept;
        static void video_setSpriteAddress(uint8_t sprite, uint8_t block) noexcept;
        static void video_setSpriteMode(uint8_t sprite, bool multicolor) noexcept;
        static void video_setSpritePos(uint8_t sprite, uint16_t x, uint16_t y) noexcept;
        static void video_setSpriteColor(uint8_t sprite, uint8_t color) noexcept;
        static void video_setSpriteCommonColors(uint8_t colorA, uint8_t colorB) noexcept;
        static uint8_t video_getSpriteAddress(const uint8_t* data=nullptr) noexcept;

        static void video_enableRasterIrq() noexcept;
        static void video_setRasterIrqLine(uint16_t line) noexcept;
        static void video_addRasterSequenceStep(uint16_t line, interrupt_handler_t fn) noexcept;
        static inline uint8_t video_getCurrentRasterSequenceStep() noexcept { return raster_sequence_step; }
        static void video_enableRasterIrqDebug(bool enable) noexcept;

        [[nodiscard]] static inline uint16_t video_getRasterLine() noexcept {
            return (memory(0xd011) & 0x80 >> 7) | memory(0xd012);
        }

        static void video_clear(uint8_t c = 0x20) noexcept;

        static void video_puts(uint8_t x, uint8_t y, const char* s) noexcept;
        static void video_puts(uint8_t x, uint8_t y, const char* s, uint8_t col) noexcept;

        static inline void video_putc(uint8_t x, uint8_t y, uint8_t c) noexcept {
            memory(screen_base + (y * 40 + x)) = c;
        }

        static inline void video_putc(uint8_t x, uint8_t y, uint8_t c, uint8_t col) noexcept {
            auto ofs = y * 40 + x;
            memory(screen_base + ofs) = c;
            memory(color_base + ofs) = col;
        }

        [[nodiscard]] static inline uint8_t video_getc(uint8_t x, uint8_t y) noexcept {
            return memory(screen_base + (y*40+x));
        }

        static void video_printNumber(uint8_t x, uint8_t y, uint8_t n) noexcept;
        static void video_printNumber(uint8_t x, uint8_t y, uint16_t n) noexcept;
        static void video_printNibble(uint8_t x, uint8_t y, uint8_t n) noexcept;
        static void video_printHexNumber(uint8_t x, uint8_t y, uint8_t n) noexcept;
        static void video_printHexNumber(uint8_t x, uint8_t y, uint16_t n) noexcept;

         __attribute__((interrupt_norecurse))
        static void video_onRasterInterrupt() noexcept;
        static void video_onVerticalBlank() noexcept;
        static void video_waitNextFrame() noexcept;
        static void video_waitLines(uint16_t lines) noexcept;

    private:
        static metrics_t metrics_;
        static volatile stats_t stats_;
        static volatile uint16_t last_frame_counter_;
        static bool raster_irq_enabled;
        static raster_step_t raster_sequence[8];
        static volatile uint8_t raster_sequence_step;
        static uint8_t raster_sequence_step_count;
        static bool raster_irq_debug;
        static uint16_t vic_base;
        static uint16_t screen_base;
        static uint16_t char_base;
        static uint16_t bitmap_base;
        static uint16_t color_base;
};

*/

#endif
