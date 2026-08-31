plugins {
  id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
rootProject.name = "aquazerofit-monorepo"

// Include the Android application as an included build
includeBuild("apps/android")
