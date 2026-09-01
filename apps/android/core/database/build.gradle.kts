plugins {
    id("azf.android.library")
    id("azf.android.hilt")
    id("azf.android.room")
}

android { namespace = "fit.aquazero.app.core.database" }

// Depends on :core:model, never :core:network. Storage must not be coupled to
// transport.
dependencies {
    api(projects.core.model)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
