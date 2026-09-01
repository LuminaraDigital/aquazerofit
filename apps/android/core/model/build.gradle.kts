plugins {
    id("azf.jvm.library")
    alias(libs.plugins.kotlin.serialization)
}

// Pure Kotlin. No Android dependency is permitted here — that is the point of
// the module: wire/domain models and the API result type stay framework-free,
// so :core:database and :core:network can both depend on them without either
// depending on the other.
dependencies {
    api(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
