plugins {
    id("azf.android.library")
    id("azf.android.hilt")
}

android {
    namespace = "fit.aquazero.app.core.network"
    buildFeatures { buildConfig = true }
}

dependencies {
    api(projects.core.model)
    implementation(projects.core.common)
    api(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    api(libs.okhttp)
    implementation(libs.okhttp.sse)
    debugImplementation(libs.okhttp.logging.interceptor)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
