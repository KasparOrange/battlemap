// battlemap v2 shell — one APK for Google TV / Android TV, Fire TV, tablets and phones.
// A thin WebView host for the web app (v2/app). See ../../docs/shell.md.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** The local signing key. Debug-style (fixed password), shared by debug and release builds so
 *  one can install over the other. Created by build.sh; copy it to every machine that builds
 *  APKs for the same devices, or updates fail with "signatures do not match". */
val shellKeystore = file(
    System.getenv("BATTLEMAP_SHELL_KEYSTORE")
        ?: "${System.getProperty("user.home")}/.config/battlemap/shell.jks"
)

android {
    namespace = "app.battlemap.table"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.battlemap.table"
        // 26 = Android 8: PackageInstaller sessions, adaptive icons; covers Fire OS 7+ (Android 9).
        minSdk = 26
        targetSdk = 35
        versionCode = (project.property("shellVersionCode") as String).toInt()
        versionName = project.property("shellVersionName") as String
    }

    signingConfigs {
        create("local") {
            storeFile = shellKeystore
            storePassword = "battlemap"
            keyAlias = "battlemap"
            keyPassword = "battlemap"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("local")
        }
        release {
            // No R8: the APK is tiny, and minifying would need keep rules for every
            // @JavascriptInterface method.
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("local")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The shell's own pages + the probe + the web app's dist, assembled by `shellAssets` below.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/shellAssets"))
    // The Rust table server (libbattlemap_server.so per ABI), built by build.sh with cargo-ndk.
    sourceSets["main"].jniLibs.srcDir(layout.buildDirectory.dir("jniLibs"))

    // Bundled web assets are already compressed where it matters; keep them stored so the
    // asset loader can stream them without inflating.
    packaging {
        // Compressed in the APK (~4 MB instead of ~10 MB per ABI), extracted at install.
        jniLibs.useLegacyPackaging = true
    }

    androidResources {
        noCompress += listOf("webp", "png", "jpg", "wasm", "woff2")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.activity:activity:1.10.1")
}

/** Assembles the APK's assets: `shell/` (the shell's test pages and the WebGL probe) and
 *  `app/` (v2/app/dist when it has been built — the bundled web app). */
val shellAssets = tasks.register<Sync>("shellAssets") {
    from("../pages") { into("shell") }
    from("../probe") { into("shell") }
    from("../../app/dist") { into("app") }
    into(layout.buildDirectory.dir("generated/shellAssets"))
}

tasks.named("preBuild") { dependsOn(shellAssets) }
