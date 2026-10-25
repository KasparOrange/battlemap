//! The JNI glue for the Android shell's `app.battlemap.table.ServerBridge` (Kotlin): start,
//! stop, the port and the log ring of the embedded server ([`crate::embed`]). Every function
//! catches panics — a panic must never unwind into the JVM. Lines also go to logcat (tag
//! `battlemap-server`).

use std::ffi::CString;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::Duration;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jint, jstring};
use tracing::Level;

#[link(name = "log")]
unsafe extern "C" {
    fn __android_log_write(prio: i32, tag: *const std::ffi::c_char, text: *const std::ffi::c_char) -> i32;
}

/// Writes one line to logcat.
fn logcat(level: Level, line: &str) {
    let prio = match level {
        Level::ERROR => 6,
        Level::WARN => 5,
        Level::INFO => 4,
        _ => 3,
    };
    let (Ok(tag), Ok(text)) = (CString::new("battlemap-server"), CString::new(line.replace('\0', " "))) else {
        return;
    };
    // SAFETY: both pointers are valid NUL-terminated strings for the call's duration.
    unsafe { __android_log_write(prio, tag.as_ptr(), text.as_ptr()) };
}

fn to_jstring(env: &mut JNIEnv, text: &str) -> jstring {
    env.new_string(text).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut())
}

/// `ServerBridge.nativeStart(settings: String): String` — `KEY=VALUE` lines in, JSON out:
/// `{"ok":true,"port":5930}` or `{"ok":false,"error":"…"}`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_battlemap_table_ServerBridge_nativeStart(mut env: JNIEnv, _class: JClass, settings: JString) -> jstring {
    let text: String = match env.get_string(&settings) {
        Ok(s) => s.into(),
        Err(e) => return to_jstring(&mut env, &serde_json::json!({ "ok": false, "error": format!("settings: {e}") }).to_string()),
    };
    let result = catch_unwind(AssertUnwindSafe(|| crate::embed::start(&text, Some(logcat))));
    let out = match result {
        Ok(Ok(port)) => serde_json::json!({ "ok": true, "port": port }),
        Ok(Err(e)) => {
            logcat(Level::ERROR, &format!("embed: start failed: {e:#}"));
            serde_json::json!({ "ok": false, "error": format!("{e:#}") })
        }
        Err(_) => serde_json::json!({ "ok": false, "error": "the server panicked while starting" }),
    };
    to_jstring(&mut env, &out.to_string())
}

/// `ServerBridge.nativeStop(graceMs: Int): Boolean` — graceful stop; false when none ran.
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_battlemap_table_ServerBridge_nativeStop(_env: JNIEnv, _class: JClass, grace_ms: jint) -> u8 {
    let grace = Duration::from_millis(grace_ms.max(0) as u64);
    catch_unwind(|| crate::embed::stop(grace)).unwrap_or(false) as u8
}

/// `ServerBridge.nativePort(): Int` — the running server's port, 0 when none runs.
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_battlemap_table_ServerBridge_nativePort(_env: JNIEnv, _class: JClass) -> jint {
    catch_unwind(crate::embed::port).ok().flatten().map(i32::from).unwrap_or(0)
}

/// `ServerBridge.nativeTakeLogs(): String` — the ring's lines since the last call (JSON array).
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_battlemap_table_ServerBridge_nativeTakeLogs(mut env: JNIEnv, _class: JClass) -> jstring {
    let text = catch_unwind(crate::embed::take_logs).unwrap_or_else(|_| "[]".into());
    to_jstring(&mut env, &text)
}
