package app.battlemap.table

/**
 * The Rust table server's JNI entry points (`libbattlemap_server.so`, built from
 * `v2/server-rs` by `shell/build.sh` with cargo-ndk; glue in `server-rs/src/android.rs`).
 * One server per process. Use [TableServer], which prepares the folders and settings.
 */
object ServerBridge {
    /** Null when the library loaded, else why it didn't (an APK built without `server-rs`). */
    val loadError: String? = try {
        System.loadLibrary("battlemap_server")
        null
    } catch (e: Throwable) {
        "${e.javaClass.simpleName}: ${e.message}"
    }

    /** Starts the server with `KEY=VALUE` settings lines; JSON `{ok, port}` or `{ok:false, error}`. Blocks until it listens. */
    external fun nativeStart(settings: String): String

    /** Graceful stop (sockets get 1001, requests may finish for [graceMs]); false when none ran. */
    external fun nativeStop(graceMs: Int): Boolean

    /** The running server's port, 0 when none runs. */
    external fun nativePort(): Int

    /** The server's log lines since the last call: JSON array of `{t, level, msg}`. */
    external fun nativeTakeLogs(): String
}
