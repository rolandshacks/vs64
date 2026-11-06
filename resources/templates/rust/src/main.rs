#![no_std]
#![no_main]

use core::ffi::c_int;
use core::panic::PanicInfo;

unsafe extern "C" {
    // llvm-mos SDK libc; on mos-sim it writes to the simulator's stdout.
    fn putchar(c: c_int) -> c_int;
    fn abort() -> !;
}

fn puts(s: &str) {
    for b in s.bytes() {
        unsafe { putchar(b as c_int) };
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn main() -> c_int {
    puts("Hello, world!\n");
    0
}

#[panic_handler]
fn panic(_: &PanicInfo) -> ! {
    unsafe { abort() }
}
