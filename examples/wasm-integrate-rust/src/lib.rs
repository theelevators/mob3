//! Minimal integrate system for mob3 Execution ABI v1.
//! No wasm-bindgen — plain externs + unsafe pointer math.

#![no_std]

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[link(wasm_import_module = "env")]
extern "C" {
    // Memory is imported by the linker via wasm memory import;
    // we only need the linear address space.
}

#[no_mangle]
pub extern "C" fn abi_version() -> i32 {
    1
}

/// Transform += Velocity * delta for dense f32 SoA columns.
#[no_mangle]
pub unsafe extern "C" fn run(
    count: i32,
    delta: f32,
    tx: i32,
    ty: i32,
    tz: i32,
    vx: i32,
    vy: i32,
    vz: i32,
) {
    let n = count as usize;
    let tx = tx as usize as *mut f32;
    let ty = ty as usize as *mut f32;
    let tz = tz as usize as *mut f32;
    let vx = vx as usize as *const f32;
    let vy = vy as usize as *const f32;
    let vz = vz as usize as *const f32;
    for i in 0..n {
        *tx.add(i) = *tx.add(i) + *vx.add(i) * delta;
        *ty.add(i) = *ty.add(i) + *vy.add(i) * delta;
        *tz.add(i) = *tz.add(i) + *vz.add(i) * delta;
    }
}
