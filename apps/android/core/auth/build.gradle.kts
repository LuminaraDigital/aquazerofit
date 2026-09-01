plugins {
    id("azf.android.library")
    id("azf.android.hilt")
}

android { namespace = "fit.aquazero.app.core.auth" }

// Implements the AuthTokenProvider / TokenRefresher interfaces that
// :core:network declares. The dependency runs one way only: auth -> network.
dependencies {
    implementation(projects.core.model)
    implementation(projects.core.network)
    implementation(libs.androidx.datastore.preferences)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
