plugins {
    id("azf.android.library")
    id("azf.android.compose")
    id("azf.android.hilt")
}

android { namespace = "fit.aquazero.app.core.ui" }

// Domain-aware shared UI: nutrition formatting, the toast sink, and the
// celebration/XP surfaces. This module exists so that no feature ever has to
// depend on another feature to reuse a composable.
dependencies {
    api(projects.core.designsystem)
    implementation(projects.core.model)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    testImplementation(libs.junit)
}
