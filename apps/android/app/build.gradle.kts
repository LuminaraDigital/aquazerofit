import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.ksp)
  alias(libs.plugins.hilt)
  alias(libs.plugins.room3)
  alias(libs.plugins.detekt)
  alias(libs.plugins.ktlint)
  alias(libs.plugins.google.services)
  alias(libs.plugins.firebase.crashlytics)
}

/** Fallback version for local builds, when no tag is driving the build. */
val defaultVersionCode = 1

/** Fallback version name for local builds. See [defaultVersionCode]. */
val defaultVersionName = "1.0.0"

/**
 * `-Pazf.versionCode=N` or `AZF_VERSION_CODE=N`. Must increase with every
 * upload; the release workflow derives it from the release tag.
 */
val versionCodeOverride: Int? =
  (providers.gradleProperty("azf.versionCode").orNull ?: System.getenv("AZF_VERSION_CODE"))
    ?.trim()
    ?.toIntOrNull()

/** `-Pazf.versionName=x.y.z` or `AZF_VERSION_NAME=x.y.z`. */
val versionNameOverride: String? =
  (providers.gradleProperty("azf.versionName").orNull ?: System.getenv("AZF_VERSION_NAME"))
    ?.trim()
    ?.takeIf { it.isNotEmpty() }

android {
  namespace = "fit.aquazero.app"
  compileSdk = 37

  defaultConfig {
    applicationId = "fit.aquazero.app"
    minSdk = 26
    targetSdk = 36

    // Instrumented tests run through Hilt's runner so @HiltAndroidTest can
    // swap the DI graph; without this the app's own Application starts and
    // every test talks to the real network.
    testInstrumentationRunner = "fit.aquazero.app.AzfTestRunner"

    // Version, overridable from CI so a tagged release ships that tag.
    //
    // A constant here is fine exactly once. Play refuses an upload whose
    // versionCode it has already accepted, so with `versionCode = 1` baked in,
    // the release workflow keeps producing green, correctly signed, identically
    // versioned bundles and every one after the first is rejected at the
    // upload step — after the signing key has already been decoded, used and
    // shredded. The tag is the single source of truth; these are the seams it
    // comes in through.
    versionCode = versionCodeOverride ?: defaultVersionCode
    versionName = versionNameOverride ?: defaultVersionName
  }

  // Release signing configuration: loads from keystore.properties (local)
  // or environment variables (CI).
  //
  // A missing keystore no longer degrades silently to an unsigned build. It
  // used to: `if (releaseKeystore.exists())` simply skipped the signingConfig,
  // so `assembleRelease` printed BUILD SUCCESSFUL and emitted
  // `app-release-unsigned.apk`. The release workflow never materialised a
  // keystore either — it exported AZF_KEYSTORE_PATH, which is a path, with
  // nothing to point it at — so a tagged release would have gone green and
  // produced an artifact Play Console rejects. The guard below turns that
  // into a build failure at packaging time. See checkReleaseSigning.
  val keystorePropsFile = rootProject.file("keystore.properties").takeIf { it.exists() }
    ?: file("keystore.properties").takeIf { it.exists() }
  val keystoreProperties = Properties().apply {
    if (keystorePropsFile != null) {
      load(keystorePropsFile.inputStream())
    }
  }

  val keystorePath = keystoreProperties.getProperty("storeFile")
    ?: System.getenv("AZF_KEYSTORE_PATH")
    ?: "keystore.jks"
  val releaseKeystore = file(keystorePath)

  signingConfigs {
    create("release") {
      storeFile = releaseKeystore
      storePassword = keystoreProperties.getProperty("storePassword")
        ?: System.getenv("AZF_KEYSTORE_PASSWORD")
        ?: ""
      keyAlias = keystoreProperties.getProperty("keyAlias")
        ?: System.getenv("AZF_KEY_ALIAS")
        ?: ""
      keyPassword = keystoreProperties.getProperty("keyPassword")
        ?: System.getenv("AZF_KEY_PASSWORD")
        ?: ""
    }
  }

  buildTypes {
    debug {
      buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api/v1\"")
      buildConfigField("String", "MEDIA_BASE_URL", "\"http://10.0.2.2:4000\"")
      // Legal/support pages are always the published ones: a debug build must
      // not show a privacy policy served off a dev laptop.
      buildConfigField("String", "WEB_BASE_URL", "\"https://app.aquazero.fit\"")
    }
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      if (releaseKeystore.exists()) {
        signingConfig = signingConfigs.getByName("release")
      }
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      buildConfigField("String", "API_BASE_URL", "\"https://app.aquazero.fit/api/v1\"")
      buildConfigField("String", "MEDIA_BASE_URL", "\"https://app.aquazero.fit\"")
      buildConfigField("String", "WEB_BASE_URL", "\"https://app.aquazero.fit\"")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    aidl = false
    buildConfig = true
    shaders = false
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

kotlin {
  jvmToolchain(17)
}

// Static analysis. `ktlintCheck detekt` is the documented pre-push gate
// (AGENTS.md); both run over the same sources the compiler sees.
//
// detekt 2.0.0-alpha is deliberate, not an oversight: 1.23.8 is the last 1.x
// and its embedded Kotlin compiler throws `IllegalArgumentException: 25.0.2`
// on the JDK 25 that Android Studio's JBR now ships, so it cannot run here at
// all. Move back to a 1.x/2.x stable the moment one supports JDK 25.
detekt {
  buildUponDefaultConfig = true
  config.setFrom(rootProject.file("config/detekt/detekt.yml"))
  // The Kotlin sources live under src/*/java in this module.
  source.setFrom(files("src/main/java", "src/test/java", "src/androidTest/java"))
}

tasks.withType<dev.detekt.gradle.Detekt>().configureEach {
  jvmTarget = JavaVersion.VERSION_17.toString()
  reports {
    html.required.set(true)
    sarif.required.set(false)
  }
}

room3 {
  schemaDirectory("$projectDir/schemas")
}

// Ship the exported schemas into the instrumented-test APK so
// MigrationTestHelper can open the real v1 JSON. Without this the migration
// test can only compare against constants it carries itself.
android.sourceSets["androidTest"].assets.srcDir("$projectDir/schemas")

/**
 * Refuse to package an unsigned release.
 *
 * The check runs at execution time on the packaging tasks rather than at
 * configuration time, so `assembleDebug`, `test`, `lint`, ktlint and detekt are
 * all unaffected by a missing keystore — only producing a release artifact is.
 *
 * `-Pazf.allowUnsignedRelease=true` is the deliberate escape hatch for someone
 * who genuinely wants a local unsigned release build (checking R8 output, say).
 * CI must never pass it: an artifact that reaches Play has to be signed, and a
 * flag is the difference between choosing that and discovering it.
 */
val allowUnsignedRelease: Boolean =
  providers.gradleProperty("azf.allowUnsignedRelease").orNull == "true"

val releaseKeystoreFile: File = run {
  val props = Properties().apply {
    val f = rootProject.file("keystore.properties").takeIf { it.exists() }
      ?: file("keystore.properties").takeIf { it.exists() }
    if (f != null) load(f.inputStream())
  }
  file(
    props.getProperty("storeFile")
      ?: System.getenv("AZF_KEYSTORE_PATH")
      ?: "keystore.jks",
  )
}

tasks.matching { it.name == "packageRelease" || it.name == "packageReleaseBundle" }
  .configureEach {
    doFirst {
      if (!releaseKeystoreFile.exists() && !allowUnsignedRelease) {
        throw GradleException(
          """
          Refusing to package an unsigned release.

          No keystore at: ${releaseKeystoreFile.absolutePath}

          In CI, decode it from a base64 secret before this task runs:
            echo "${'$'}{{ secrets.AZF_KEYSTORE_BASE64 }}" | base64 -d > apps/android/app/keystore.jks
          and set AZF_KEYSTORE_PATH to that file, plus AZF_KEYSTORE_PASSWORD,
          AZF_KEY_ALIAS and AZF_KEY_PASSWORD.

          Locally, either create app/keystore.properties or pass
          -Pazf.allowUnsignedRelease=true if you actually want an unsigned build.
          """.trimIndent(),
        )
      }
    }
  }

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.core.splashscreen)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material.icons.extended)
  debugImplementation(libs.androidx.compose.ui.tooling)

  // Navigation 3
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // DI
  implementation(libs.hilt.android)
  ksp(libs.hilt.compiler)
  implementation(libs.androidx.hilt.work)
  implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
  ksp(libs.androidx.hilt.compiler)

  // Database (Room 3)
  implementation(libs.room3.runtime)
  ksp(libs.room3.compiler)

  // Network
  implementation(libs.retrofit)
  implementation(libs.retrofit.converter.kotlinx.serialization)
  implementation(libs.okhttp)
  implementation(libs.okhttp.sse)
  debugImplementation(libs.okhttp.logging.interceptor)
  implementation(libs.kotlinx.serialization.json)

  // Images
  implementation(libs.coil.compose)
  implementation(libs.coil.network.okhttp)

  // Legal / support / source links (Chrome Custom Tabs)
  implementation(libs.androidx.browser)

  // Storage / background
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.work.runtime.ktx)

  // Health Connect — passive steps/heart rate/sleep in, weight out.
  implementation(libs.androidx.health.connect)

  // Home-screen widget. Glance renders through RemoteViews rather than
  // Compose UI, so nothing in core:designsystem can be reused inside it.
  implementation(libs.androidx.glance.appwidget)
  implementation(libs.androidx.glance.material3)

  // Camera / ML
  implementation(libs.androidx.camera.core)
  implementation(libs.androidx.camera.camera2)
  implementation(libs.androidx.camera.lifecycle)
  implementation(libs.androidx.camera.compose)
  implementation(libs.androidx.camera.mlkit.vision)
  implementation(libs.mlkit.barcode.scanning)

  // Google Play Billing — the premium subscription. The AAR carries its own
  // com.android.vending.BILLING permission, <queries> entry and consumer
  // ProGuard rules, so nothing has to be repeated in the manifest here.
  implementation(libs.play.billing.ktx)

  // Firebase
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.analytics)
  implementation(libs.firebase.crashlytics)

  // Local tests
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  // Lets SchemaMigrationReadinessTest read app/schemas/*.json directly rather
  // than transcribing the identity hash into a constant it has to be told to
  // update. See the assets srcDir below.
  androidTestImplementation(libs.room3.testing)
  androidTestImplementation(libs.hilt.android.testing)
  kspAndroidTest(libs.hilt.compiler)
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)
  androidTestImplementation(libs.androidx.test.uiautomator)
}
