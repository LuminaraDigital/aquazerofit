plugins {
    id("azf.android.library")
    id("azf.android.compose")
    id("azf.android.hilt")
}

android { namespace = "fit.aquazero.app.core.ui" }

// Domain-aware shared UI: nutrition formatting, the toast sink, the
// celebration/XP surfaces, the coach roster and art, and the local reminder
// subsystem. This module exists so that no feature ever has to depend on
// another feature to reuse a composable — or, in the reminder case, to honour
// a consent that two different screens can set.
//
// The reminder code brings `:core:data` and the DataStore/WorkManager
// dependencies with it. One reference still points the wrong way:
// `ReminderNotifier` builds its content intent from `MainActivity`, which lives
// in `:app`. That was already an upward reference while the code sat in
// `:feature:settings`, and Phase 3 has to resolve it — a launch intent from the
// package manager, or an SPI the app binds — before this module can be
// extracted for real.
dependencies {
    api(projects.core.designsystem)
    implementation(projects.core.model)
    implementation(projects.core.data)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    testImplementation(libs.junit)
}
